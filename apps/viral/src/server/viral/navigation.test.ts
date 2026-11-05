import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { VIRAL_NAV_SECTION_ID } from "@/lib/viral/menu"
import { type CustomShellDb } from "@/server/db"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"
import { viralNavigationAdded } from "@/server/viral/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { addViralNavigation } from "@/server/viral/navigation"

/** Projects and Vault reach each left menu once, and stay gone once removed (task part 1). */

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

describe("the left menu job", () => {
  it("adds Projects and Vault to every menu once, however often it runs", async () => {
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
    const links = added[0].entries.map((entry: { label: string; href: string }) => [entry.label, entry.href])
    expect(links[0]).toEqual(["Today", "/admin/today"])
    expect(links).toEqual(expect.arrayContaining([["Projects", "/admin/projects"], ["Vault", "/admin/vault"]]))
    expect(links.filter(([label]: string[]) => label === "Today")).toHaveLength(1)
    const [members] = await database.select().from(customShellSettings).where(eq(customShellSettings.key, "default"))
    expect(viralSections((members.settings as { memberSections?: unknown }).memberSections)).toHaveLength(1)
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

  it("puts Today first in a section made before Today existed, once", async () => {
    const user = await insertUser(database)
    const workspace = await insertWorkspace(database, { userId: user.id })
    const older = {
      id: VIRAL_NAV_SECTION_ID,
      title: "Viral",
      entries: [{ type: "item", id: "item-viral-projects", label: "Projects", href: "/admin/projects", icon: "flame", visible: true }],
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
    const labels = section.entries.map((entry: { label: string }) => entry.label)
    expect(labels.slice(0, 2)).toEqual(["Today", "Projects"])
    expect(labels.filter((label: string) => label === "Today")).toHaveLength(1)
  })

  it("makes Today the home page once, and only when nobody chose one", async () => {
    await database.insert(customShellSettings).values({ key: "default", settings: {}, createdAt: new Date(), updatedAt: new Date() })
    await addViralNavigation(database)
    const [first] = await database.select().from(customShellSettings).where(eq(customShellSettings.key, "default"))
    expect((first.settings as { adminRoute?: string }).adminRoute).toBe("/admin/today")

    // An admin picks another page later: the job never takes it back.
    await database
      .update(customShellSettings)
      .set({ settings: { ...(first.settings as object), adminRoute: "/admin/projects" } })
      .where(eq(customShellSettings.key, "default"))
    await addViralNavigation(database)
    const [later] = await database.select().from(customShellSettings).where(eq(customShellSettings.key, "default"))
    expect((later.settings as { adminRoute?: string }).adminRoute).toBe("/admin/projects")
  })

  it("leaves a home page somebody already chose alone", async () => {
    await database
      .insert(customShellSettings)
      .values({ key: "default", settings: { adminRoute: "/admin/vault" }, createdAt: new Date(), updatedAt: new Date() })
    await addViralNavigation(database)
    const [row] = await database.select().from(customShellSettings).where(eq(customShellSettings.key, "default"))
    expect((row.settings as { adminRoute?: string }).adminRoute).toBe("/admin/vault")
  })
})
