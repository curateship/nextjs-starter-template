import { beforeEach, describe, expect, it } from "vitest"

import { DEFAULT_CRM_WIDGET_LAYOUT, DEFAULT_WIDGET_LAYOUT } from "@/lib/admin-dashboard/overview-widgets"
import { getWidgetLayout, saveWidgetLayout } from "@/server/admin-dashboard/widgets"
import { type CustomShellDb } from "@/server/db"
import { customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** An Overview's widget layout, one per site and dashboard, against a real database. */
describe("the Overview widget layout", () => {
  let db: CustomShellDb

  beforeEach(async () => {
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const owner = await insertUser(db, { email: "owner@example.com" })
    for (const id of ["ws-a", "ws-b"]) {
      await db.insert(customShellWorkspaces).values({
        id,
        userId: owner.id,
        name: id,
        settings: {},
        subdomain: `w-${id}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }
  })

  it("shows the default layout to a site that never saved one", async () => {
    expect(await getWidgetLayout("ws-a", "admin", db)).toEqual(DEFAULT_WIDGET_LAYOUT)
  })

  it("saves a layout cleaned, for that site alone", async () => {
    const stored = await saveWidgetLayout(
      "ws-a",
      "admin",
      { top: { columns: 4, spots: ["devices", "devices", "made-up", null] }, bottom: { columns: 0, spots: ["views"] } },
      db
    )
    expect(stored).toEqual({ top: { columns: 4, spots: ["devices", null, null, null] }, bottom: { columns: 0, spots: [] } })
    expect(await getWidgetLayout("ws-a", "admin", db)).toEqual(stored)
    expect(await getWidgetLayout("ws-b", "admin", db)).toEqual(DEFAULT_WIDGET_LAYOUT)

    // A second save replaces the first.
    await saveWidgetLayout("ws-a", "admin", DEFAULT_WIDGET_LAYOUT, db)
    expect(await getWidgetLayout("ws-a", "admin", db)).toEqual(DEFAULT_WIDGET_LAYOUT)
  })

  it("keeps the CRM's layout apart from the Admin one", async () => {
    // The CRM offers no widgets of the shell's, so one sent is emptied.
    expect(await getWidgetLayout("ws-a", "crm", db)).toEqual(DEFAULT_CRM_WIDGET_LAYOUT)
    const stored = await saveWidgetLayout(
      "ws-a",
      "crm",
      { top: { columns: 3, spots: ["views", null, null] }, bottom: { columns: 1, spots: [null] } },
      db
    )
    expect(stored).toEqual({ top: { columns: 3, spots: [null, null, null] }, bottom: { columns: 1, spots: [null] } })
    expect(await getWidgetLayout("ws-a", "crm", db)).toEqual(stored)
    expect(await getWidgetLayout("ws-a", "admin", db)).toEqual(DEFAULT_WIDGET_LAYOUT)
  })
})
