import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { SAVED_VIEW_ERRORS, SAVED_VIEW_LIMITS, type SavedViewValues } from "@/lib/saved-views"
import type { SavedViewScreen } from "@/server/app-options"
import {
  deleteSavedView,
  deleteSavedViewsFor,
  listSavedViews,
  saveSavedView,
  updateSavedView,
} from "@/server/saved-views"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

/** A made-up screen: only record "open" may keep views, and only `status` and `q` are kept. */
const screens: Record<string, SavedViewScreen> = {
  board: {
    authorize: async ({ recordId }) => {
      if (recordId !== "open") throw new Error("FORBIDDEN")
    },
    keep: ({ filters }) => {
      const kept: SavedViewValues = {}
      if (typeof filters.status === "string" && filters.status) kept.status = filters.status
      if (typeof filters.q === "string" && filters.q.trim()) kept.q = filters.q.trim()
      return kept
    },
    namesOf: async ({ filters }): Promise<Record<string, string>> =>
      filters.status ? { status: `Status ${filters.status}` } : {},
  },
}

describe("saved views", () => {
  it("keeps a person's own views on a screen, oldest first", async () => {
    const anna = await insertUser(database)
    const ben = await insertUser(database)
    const first = await saveSavedView(
      anna.id,
      { screen: "board:open", name: "Stuck", filters: { status: "stuck", extra: "dropped" } },
      database,
      screens
    )
    expect(first.filters).toEqual({ status: "stuck" })
    expect(first.names).toEqual({ status: "Status stuck" })
    await saveSavedView(anna.id, { screen: "board:open", name: "Search", filters: { q: " logo " } }, database, screens)

    const mine = await listSavedViews(anna.id, "board:open", database)
    expect(mine.map((view) => view.name)).toEqual(["Stuck", "Search"])
    expect(mine[1].filters).toEqual({ q: "logo" })
    expect(await listSavedViews(ben.id, "board:open", database)).toEqual([])
  })

  it("refuses a kind nobody registered, a record the screen refuses, and empty filters", async () => {
    const anna = await insertUser(database)
    await expect(
      saveSavedView(anna.id, { screen: "elsewhere:open", name: "X", filters: { status: "a" } }, database, screens)
    ).rejects.toThrow(SAVED_VIEW_ERRORS.unknownScreen)
    await expect(
      saveSavedView(anna.id, { screen: "board:secret", name: "X", filters: { status: "a" } }, database, screens)
    ).rejects.toThrow("FORBIDDEN")
    await expect(
      saveSavedView(anna.id, { screen: "board:open", name: "X", filters: { q: "  " } }, database, screens)
    ).rejects.toThrow(SAVED_VIEW_ERRORS.needsFilters)
  })

  it("stops at the per-screen limit", async () => {
    const anna = await insertUser(database)
    for (let index = 0; index < SAVED_VIEW_LIMITS.perScreen; index++) {
      await saveSavedView(anna.id, { screen: "board:open", name: `V${index}`, filters: { q: `${index}` } }, database, screens)
    }
    await expect(
      saveSavedView(anna.id, { screen: "board:open", name: "One more", filters: { q: "x" } }, database, screens)
    ).rejects.toThrow(SAVED_VIEW_ERRORS.tooMany)
  })

  it("edits and deletes only the person's own view", async () => {
    const anna = await insertUser(database)
    const ben = await insertUser(database)
    const view = await saveSavedView(anna.id, { screen: "board:open", name: "Stuck", filters: { status: "stuck" } }, database, screens)

    await expect(
      updateSavedView(ben.id, { viewId: view.id, name: "Mine now", filters: { status: "todo" } }, database, screens)
    ).rejects.toThrow(SAVED_VIEW_ERRORS.notFound)
    const edited = await updateSavedView(anna.id, { viewId: view.id, name: "To do", filters: { status: "todo" } }, database, screens)
    expect(edited).toMatchObject({ name: "To do", filters: { status: "todo" }, names: { status: "Status todo" } })

    await expect(deleteSavedView(ben.id, view.id, database)).rejects.toThrow(SAVED_VIEW_ERRORS.notFound)
    await deleteSavedView(anna.id, view.id, database)
    expect(await listSavedViews(anna.id, "board:open", database)).toEqual([])
  })

  it("clears the views on screens an app says are gone, for one person or everyone", async () => {
    const anna = await insertUser(database)
    const ben = await insertUser(database)
    await saveSavedView(anna.id, { screen: "board:open", name: "A", filters: { q: "a" } }, database, screens)
    await saveSavedView(ben.id, { screen: "board:open", name: "B", filters: { q: "b" } }, database, screens)

    await deleteSavedViewsFor({ userId: anna.id, screens: ["board:open"] }, database)
    expect(await listSavedViews(anna.id, "board:open", database)).toEqual([])
    expect(await listSavedViews(ben.id, "board:open", database)).toHaveLength(1)

    await deleteSavedViewsFor({ screens: ["board:open"] }, database)
    expect(await listSavedViews(ben.id, "board:open", database)).toEqual([])
  })
})
