import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { VIRAL_NAV_SECTION_ID } from "@/lib/viral/menu"
import { type CustomShellDb } from "@/server/db"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"
import { viralNavigationAdded } from "@/server/viral/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { addViralNavigation } from "@/server/viral/navigation"

/** The Viral dashboard's one link reaches each left menu once, and stays gone once removed (task features/03). */

let client: PGlite
let database: CustomShellDb

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

function viralSections(sections: unknown) {
  return (Array.isArray(sections) ? sections : []).filter((section: { id?: string }) => section?.id === VIRAL_NAV_SECTION_ID)
}

const linksOf = (section: { entries: { label: string; href: string }[] }) =>
  section.entries.map((entry) => [entry.label, entry.href])

describe("the left menu job", () => {
  it("adds the one Viral link to every menu once, however often it runs", async () => {
    const user = await insertUser(database)
    const workspace = await insertWorkspace(database, { userId: user.id })
    await database
      .update(customShellWorkspaces)
      .set({ settings: { sections: [] } })
      .where(eq(customShellWorkspaces.id, workspace.id))

    await addViralNavigation(database)
    await addViralNavigation(database)

    const [row] = await database.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspace.id))
    const added = viralSections((row.settings as { sections?: unknown }).sections)
    expect(added).toHaveLength(1)
    expect(linksOf(added[0])).toEqual([["Viral", "/admin/viral"]])
    const [members] = await database.select().from(customShellSettings).where(eq(customShellSettings.key, "default"))
    const memberSections = viralSections((members.settings as { memberSections?: unknown }).memberSections)
    expect(memberSections).toHaveLength(1)
    expect(linksOf(memberSections[0])).toEqual([["Viral", "/admin/viral"]])
  })

  it("never puts the section back after an admin removed it", async () => {
    const user = await insertUser(database)
    const workspace = await insertWorkspace(database, { userId: user.id })
    await database.update(customShellWorkspaces).set({ settings: { sections: [] } }).where(eq(customShellWorkspaces.id, workspace.id))
    await addViralNavigation(database)
    await database.update(customShellWorkspaces).set({ settings: { sections: [] } }).where(eq(customShellWorkspaces.id, workspace.id))
    await addViralNavigation(database)
    const [row] = await database.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspace.id))
    expect(viralSections((row.settings as { sections?: unknown }).sections)).toHaveLength(0)
  })

  it("swaps Today, Projects, Vault and Library for the one link, once, keeping the admin's own links", async () => {
    const user = await insertUser(database)
    const workspace = await insertWorkspace(database, { userId: user.id })
    const item = (id: string, label: string, href: string) => ({ type: "item", id, label, href, icon: "flame", visible: true })
    const older = {
      id: VIRAL_NAV_SECTION_ID,
      title: "Viral",
      entries: [
        item("item-mine", "Mine", "/admin/mine"),
        item("item-viral-today", "Today", "/admin/today"),
        item("item-viral-projects", "Projects", "/admin/projects"),
        item("item-viral-vault", "Vault", "/admin/vault"),
        item("item-viral-library", "Library", "/admin/library"),
      ],
    }
    await database.update(customShellWorkspaces).set({ settings: { sections: [older] } }).where(eq(customShellWorkspaces.id, workspace.id))
    await database.insert(viralNavigationAdded).values([
      { scope: "members", addedAt: new Date() },
      { scope: `workspace:${workspace.id}`, addedAt: new Date() },
    ])

    await addViralNavigation(database)
    await addViralNavigation(database)

    const [row] = await database.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspace.id))
    const [section] = viralSections((row.settings as { sections?: unknown }).sections)
    expect(linksOf(section)).toEqual([
      ["Mine", "/admin/mine"],
      ["Viral", "/admin/viral"],
    ])
  })

  it("moves a home page still on Today to the dashboard, once", async () => {
    await database
      .insert(customShellSettings)
      .values({ key: "default", settings: { adminRoute: "/admin/today" }, createdAt: new Date(), updatedAt: new Date() })
    await addViralNavigation(database)
    const [first] = await database.select().from(customShellSettings).where(eq(customShellSettings.key, "default"))
    expect((first.settings as { adminRoute?: string }).adminRoute).toBe("/admin/viral")

    // An admin picks another page later: the job never takes it back.
    await database
      .update(customShellSettings)
      .set({ settings: { ...(first.settings as object), adminRoute: "/admin/dashboard" } })
      .where(eq(customShellSettings.key, "default"))
    await addViralNavigation(database)
    const [later] = await database.select().from(customShellSettings).where(eq(customShellSettings.key, "default"))
    expect((later.settings as { adminRoute?: string }).adminRoute).toBe("/admin/dashboard")
  })

  it("leaves a home page somebody already chose alone", async () => {
    await database
      .insert(customShellSettings)
      .values({ key: "default", settings: { adminRoute: "/admin/dashboard" }, createdAt: new Date(), updatedAt: new Date() })
    await addViralNavigation(database)
    const [row] = await database.select().from(customShellSettings).where(eq(customShellSettings.key, "default"))
    expect((row.settings as { adminRoute?: string }).adminRoute).toBe("/admin/dashboard")
  })
})
