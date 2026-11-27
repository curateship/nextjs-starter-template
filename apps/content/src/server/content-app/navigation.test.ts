import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { CONTENT_HOME_PATH, CONTENT_NAV_SECTION_ID } from "@/lib/content-app/menu"
import { addContentNavigation, withContentSection } from "@/server/content-app/navigation"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertWorkspace, type TestDatabase } from "@/server/test-support"

describe("Content's left menu", () => {
  let client: PGlite
  let db: TestDatabase

  beforeEach(async () => {
    ;({ client, db } = await createTestDatabase())
  })

  afterEach(async () => {
    await client.close()
  })

  it("puts Content's section first, once, starting with Projects", async () => {
    const workspace = await insertWorkspace(db, { settings: { sections: [{ id: "section-other", title: "Other", entries: [] }] } })
    await addContentNavigation(db)
    await addContentNavigation(db)
    const [row] = await db.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspace.id))
    const sections = (row.settings as { sections: Array<{ id: string; entries: Array<{ label: string; href: string }> }> }).sections
    expect(sections.map((section) => section.id)).toEqual([CONTENT_NAV_SECTION_ID, "section-other"])
    expect(sections[0].entries[0]).toMatchObject({ label: "Projects", href: "/admin/projects" })
    expect(sections[0].entries.map((entry) => entry.label)).toEqual(["Projects", "Anti Detect", "Carousels", "Actors", "Flow"])
  })

  it("keeps a section the admin removed afterwards removed", async () => {
    const workspace = await insertWorkspace(db, { settings: { sections: [] } })
    await addContentNavigation(db)
    await db.update(customShellWorkspaces).set({ settings: { sections: [] } }).where(eq(customShellWorkspaces.id, workspace.id))
    await addContentNavigation(db)
    const [row] = await db.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspace.id))
    expect((row.settings as { sections: unknown[] }).sections).toEqual([])
  })

  it("makes the Projects dashboard home only while nobody chose one", async () => {
    await addContentNavigation(db)
    const [row] = await db.select().from(customShellSettings).where(eq(customShellSettings.key, "default"))
    expect((row.settings as { adminRoute?: string }).adminRoute).toBe(CONTENT_HOME_PATH)
  })

  it("gives a workspace with no stored menu Content's section", async () => {
    // What the shell's own setup makes for a fresh database: settings with no sections.
    const workspace = await insertWorkspace(db, { settings: {} })
    await addContentNavigation(db)
    const [row] = await db.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspace.id))
    const sections = (row.settings as { sections: Array<{ id: string }> }).sections
    expect(sections.map((section) => section.id)).toEqual([CONTENT_NAV_SECTION_ID])
  })

  it("leaves a stored menu that isn't a list alone, and tries again later", async () => {
    expect(withContentSection({ broken: true })).toBeNull()
    const workspace = await insertWorkspace(db, { settings: { sections: { broken: true } } })
    await addContentNavigation(db)
    await db.update(customShellWorkspaces).set({ settings: { sections: [] } }).where(eq(customShellWorkspaces.id, workspace.id))
    await addContentNavigation(db)
    const [row] = await db.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspace.id))
    expect((row.settings as { sections: Array<{ id: string }> }).sections.map((section) => section.id)).toEqual([CONTENT_NAV_SECTION_ID])
  })
})
