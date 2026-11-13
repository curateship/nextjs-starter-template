import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ANTI_DETECT_PAGE_ERRORS, DEFAULT_ANTI_DETECT_WIDGETS } from "@/lib/anti-detect/page"
import {
  getAntiDetectPageAndSections,
  getAntiDetectWidgets,
  saveAntiDetectPageBody,
  saveAntiDetectSections,
  saveAntiDetectWidgets,
  setAntiDetectPageLock,
} from "@/server/anti-detect/page"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

/** The Anti Detect dashboard's left page, its sections and Overview's layout, each person's own (Tyler, 12 Nov 2026). */

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

describe("the Anti Detect dashboard's left page", () => {
  it("starts with Dashboards, Projects and the rack blocks, and keeps one Dashboards block whatever is saved", async () => {
    expect(types((await getAntiDetectPageAndSections(anna.id, db)).page.body)).toEqual([
      "notePromoAntiDetectSections",
      "notePromoAntiDetectProjects",
      "notePromoAntiDetectRacks",
      "notePromoAntiDetectPhoneCounts",
      "paragraph",
    ])
    const typed = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "New proxies Friday" }] }] }
    await saveAntiDetectPageBody(anna.id, JSON.stringify(typed), db)
    expect(types((await getAntiDetectPageAndSections(anna.id, db)).page.body)).toEqual(["notePromoAntiDetectSections", "paragraph"])
    // A second Dashboards block, and the Projects dashboard's own blocks, are dropped.
    await saveAntiDetectPageBody(
      anna.id,
      JSON.stringify({ type: "doc", content: [{ type: "notePromoAntiDetectSections" }, { type: "notePromoAntiDetectSections" }, { type: "notePromoSections" }, { type: "paragraph" }] }),
      db
    )
    expect(types((await getAntiDetectPageAndSections(anna.id, db)).page.body)).toEqual(["notePromoAntiDetectSections", "paragraph"])
    // Each person's page is their own.
    expect(types((await getAntiDetectPageAndSections(ben.id, db)).page.body)).toHaveLength(5)
  })

  it("refuses to save a locked page", async () => {
    await setAntiDetectPageLock(anna.id, true, db)
    await expect(saveAntiDetectPageBody(anna.id, JSON.stringify({ type: "doc", content: [] }), db)).rejects.toThrow(ANTI_DETECT_PAGE_ERRORS.locked)
  })

  it("keeps the sections hidden and their order, never Overview or a section it does not know", async () => {
    await saveAntiDetectSections(anna.id, { hidden: ["bans", "overview", "voices"] as never, order: ["phones", "profiles", "phones", "racks"] as never }, db)
    expect((await getAntiDetectPageAndSections(anna.id, db)).sections).toEqual({ hidden: ["bans"], order: ["phones", "profiles"] })
    expect((await getAntiDetectPageAndSections(ben.id, db)).sections).toEqual({ hidden: [], order: [] })
  })

  it("starts Overview with Tyler's four widgets and keeps a layout cleaned of widgets it does not know", async () => {
    expect(await getAntiDetectWidgets(anna.id, db)).toEqual(DEFAULT_ANTI_DETECT_WIDGETS)
    const saved = await saveAntiDetectWidgets(anna.id, { top: { columns: 1, spots: ["racks"] }, bottom: { columns: 2, spots: ["bans-30-days", "posts-need-you"] } }, db)
    expect(saved.top.spots).toEqual(["racks"])
    expect(saved.bottom.spots).not.toContain("posts-need-you")
    expect(await getAntiDetectWidgets(anna.id, db)).toEqual(saved)
    expect(await getAntiDetectWidgets(ben.id, db)).toEqual(DEFAULT_ANTI_DETECT_WIDGETS)
  })
})
