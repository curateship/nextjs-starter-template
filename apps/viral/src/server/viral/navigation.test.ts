import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { VIRAL_NAV_SECTION_ID } from "@/lib/viral/menu"
import { type CustomShellDb } from "@/server/db"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"
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
    expect(added[0].entries.map((entry: { label: string; href: string }) => [entry.label, entry.href])).toEqual([
      ["Projects", "/admin/projects"],
      ["Vault", "/admin/vault"],
    ])
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
})
