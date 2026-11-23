import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertWorkspace } from "@/server/test-support"

/**
 * Migration 0103 puts one Library link in every saved left menu where the
 * first of Videos, Notes and Posts was, takes the other two out (inside a
 * group too), and leaves a menu with its own /library link holding just that.
 */

const MIGRATION = new URL("../../../../drizzle/0103_note_library_menu.sql", import.meta.url)

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

function item(id: string, href: string) {
  return { type: "item", id, href, label: id, visible: true }
}

async function runMigration() {
  await client.exec(await readFile(MIGRATION, "utf8"))
}

async function hrefsOf(workspaceId: string) {
  const [row] = await database.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspaceId))
  type Entry = { href?: string; children?: Entry[] }
  const sections = (row.settings as { sections: { entries: Entry[] }[] }).sections
  return sections.map((section) =>
    section.entries.map((entry) => (entry.children ? { group: entry.children.map((child) => child.href) } : entry.href))
  )
}

describe("the Library menu link", () => {
  it("takes the place of the first of the three and drops the other two", async () => {
    const workspace = await insertWorkspace(database, {
      settings: {
        sections: [
          { id: "s1", entries: [item("dash", "/admin/dashboard"), item("v", "/videos"), item("n", "/notes")] },
          { id: "s2", entries: [item("crm", "/admin/crm"), item("p", "/posts")] },
        ],
      },
    })
    await runMigration()
    expect(await hrefsOf(workspace.id)).toEqual([["/admin/dashboard", "/library"], ["/admin/crm"]])
  })

  it("reaches inside a group", async () => {
    const workspace = await insertWorkspace(database, {
      settings: {
        sections: [
          {
            id: "s1",
            entries: [
              item("dash", "/admin/dashboard"),
              { type: "group", id: "g", label: "Stuff", children: [item("n", "/notes"), item("m", "/admin/media")] },
            ],
          },
        ],
      },
    })
    await runMigration()
    expect(await hrefsOf(workspace.id)).toEqual([["/admin/dashboard", { group: ["/library", "/admin/media"] }]])
  })

  it("adds Library after the first entry of a menu that had none of the three", async () => {
    const workspace = await insertWorkspace(database, {
      settings: { sections: [{ id: "s1", entries: [item("dash", "/admin/dashboard"), item("crm", "/admin/crm")] }] },
    })
    await runMigration()
    expect(await hrefsOf(workspace.id)).toEqual([["/admin/dashboard", "/library", "/admin/crm"]])
  })

  it("leaves a menu that already links to /library with one link", async () => {
    const workspace = await insertWorkspace(database, {
      settings: {
        sections: [{ id: "s1", entries: [item("lib", "/library"), item("v", "/videos")] }],
      },
    })
    await runMigration()
    expect(await hrefsOf(workspace.id)).toEqual([["/library"]])
  })

  it("keeps a hidden or admin-only link that way when Library takes its place", async () => {
    const workspace = await insertWorkspace(database, {
      settings: {
        sections: [
          { id: "s1", entries: [item("dash", "/admin/dashboard"), { ...item("n", "/notes"), visible: false, roles: ["admin"] }] },
        ],
      },
    })
    await runMigration()
    const [row] = await database.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspace.id))
    const library = (row.settings as { sections: { entries: Record<string, unknown>[] }[] }).sections[0].entries[1]
    expect(library).toMatchObject({ href: "/library", label: "Library", visible: false, roles: ["admin"] })
  })

  it("leaves a section with no list of entries alone and puts Library in the first that has one", async () => {
    const workspace = await insertWorkspace(database, {
      settings: {
        sections: [{ id: "empty", label: "Nothing here" }, { id: "s2", entries: [item("dash", "/admin/dashboard")] }],
      },
    })
    await runMigration()
    const [row] = await database.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspace.id))
    const sections = (row.settings as { sections: { entries?: { href: string }[] }[] }).sections
    expect(sections[0].entries).toBeUndefined()
    expect(sections[1].entries?.map((entry) => entry.href)).toEqual(["/admin/dashboard", "/library"])
  })

  it("changes the members' menu too", async () => {
    await database
      .insert(customShellSettings)
      .values({
        key: "default",
        settings: { memberSections: [{ id: "m", entries: [item("c", "/changelog"), item("v", "/videos")] }] },
        createdAt: now(),
        updatedAt: now(),
      })
      .onConflictDoUpdate({
        target: customShellSettings.key,
        set: { settings: { memberSections: [{ id: "m", entries: [item("c", "/changelog"), item("v", "/videos")] }] } },
      })
    await runMigration()
    const [row] = await database.select().from(customShellSettings).where(eq(customShellSettings.key, "default"))
    const entries = (row.settings as { memberSections: { entries: { href: string }[] }[] }).memberSections[0].entries
    expect(entries.map((entry) => entry.href)).toEqual(["/changelog", "/library"])
  })
})
