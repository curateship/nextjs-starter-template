import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_PROJECTS_WIDGETS, PROJECTS_PAGE_ERRORS } from "@/lib/social/projects-dashboard-page"
import type { CustomShellUser } from "@/server/schema"
import {
  getProjectsPageAndSections,
  getProjectsWidgets,
  saveProjectsPageBody,
  saveProjectsSections,
  saveProjectsWidgets,
  setProjectsPageLock,
} from "@/server/social/projects-dashboard"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

/** The Projects dashboard's left page, its sections and Overview's layout, each person's own. */

let client: PGlite
let db: TestDatabase
let anna: CustomShellUser
let ben: CustomShellUser

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  anna = await insertUser(db)
  ben = await insertUser(db)
})

afterEach(async () => {
  await client.close()
})

const types = (body: string) => JSON.parse(body).content.map((node: { type: string }) => node.type)

describe("the Projects dashboard's left page", () => {
  it("starts with the Dashboards and Projects blocks, and keeps the Dashboards block whatever is saved", async () => {
    expect(types((await getProjectsPageAndSections(anna.id, db)).page.body)).toEqual(["notePromoSections", "notePromoProjects", "paragraph"])

    const typed = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Launch Thursday" }] }] }
    await saveProjectsPageBody(anna.id, JSON.stringify(typed), db)
    expect(types((await getProjectsPageAndSections(anna.id, db)).page.body)).toEqual(["notePromoSections", "paragraph"])
    // A second Dashboards block is dropped.
    await saveProjectsPageBody(
      anna.id,
      JSON.stringify({ type: "doc", content: [{ type: "notePromoSections" }, { type: "notePromoSections" }, { type: "paragraph" }] }),
      db
    )
    expect(types((await getProjectsPageAndSections(anna.id, db)).page.body)).toEqual(["notePromoSections", "paragraph"])
    // Each person's page is their own.
    expect(types((await getProjectsPageAndSections(ben.id, db)).page.body)).toHaveLength(3)
  })

  it("refuses to save a locked page", async () => {
    await setProjectsPageLock(anna.id, true, db)
    await expect(saveProjectsPageBody(anna.id, JSON.stringify({ type: "doc", content: [] }), db)).rejects.toThrow(PROJECTS_PAGE_ERRORS.locked)
  })

  it("keeps the sections hidden and their order, never Overview or a section it does not know", async () => {
    expect((await getProjectsPageAndSections(anna.id, db)).sections).toEqual({ hidden: [], order: [] })
    await saveProjectsSections(
      anna.id,
      { hidden: ["voices", "overview" as never], order: ["messages", "projects", "nonsense" as never] },
      db
    )
    expect((await getProjectsPageAndSections(anna.id, db)).sections).toEqual({ hidden: ["voices"], order: ["messages", "projects"] })
  })

  it("starts Overview with Tyler's five widgets and cleans a saved layout", async () => {
    expect(await getProjectsWidgets(anna.id, db)).toEqual(DEFAULT_PROJECTS_WIDGETS)
    const saved = await saveProjectsWidgets(
      anna.id,
      { top: { columns: 2, spots: ["bans", "bans"] }, bottom: { columns: 1, spots: ["not-a-widget"] } },
      db
    )
    // A widget shows once, and one nobody knows is emptied.
    expect(saved).toEqual({ top: { columns: 2, spots: ["bans", null] }, bottom: { columns: 1, spots: [null] } })
    expect(await getProjectsWidgets(anna.id, db)).toEqual(saved)
  })
})
