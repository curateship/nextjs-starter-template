import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertWorkspace } from "@/server/test-support"

/**
 * Migration 0099 puts a Notes link in every saved left menu, right after the
 * Videos link, or after the first entry when a menu has no Videos link, and
 * leaves alone a menu that already links to /notes.
 */

const MIGRATION = new URL("../../../../drizzle/0099_note_notes_menu.sql", import.meta.url)
const NOTES = {
  type: "item",
  id: "item-note-notes",
  href: "/notes",
  label: "Notes",
  icon: "notebook-pen",
  visible: true,
}

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

async function sectionsOf(workspaceId: string) {
  const [row] = await database
    .select()
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.id, workspaceId))
  return (row.settings as { sections: { entries: { id: string }[] }[] }).sections
}

describe("the Notes menu link", () => {
  it("goes right after the Videos link, in whichever section holds it", async () => {
    const workspace = await insertWorkspace(database, {
      settings: {
        sections: [
          { id: "one", title: "One", entries: [item("overview", "/admin/dashboard")] },
          {
            id: "two",
            title: "Two",
            entries: [item("home", "/home"), item("item-note-videos", "/videos"), item("ai", "/admin/ai")],
          },
        ],
      },
    })

    await runMigration()

    const sections = await sectionsOf(workspace.id)
    expect(sections[0].entries.map((entry) => entry.id)).toEqual(["overview"])
    expect(sections[1].entries.map((entry) => entry.id)).toEqual([
      "home",
      "item-note-videos",
      "item-note-notes",
      "ai",
    ])
    expect(sections[1].entries[2]).toEqual(NOTES)
  })

  it("goes after the first entry when there is no Videos link", async () => {
    const workspace = await insertWorkspace(database, {
      settings: { sections: [{ id: "one", title: "One", entries: [item("a", "/a"), item("b", "/b")] }] },
    })
    await runMigration()
    expect((await sectionsOf(workspace.id))[0].entries.map((entry) => entry.id)).toEqual([
      "a",
      "item-note-notes",
      "b",
    ])
  })

  it("goes into the members' menu after Videos too", async () => {
    const at = now()
    await database.delete(customShellSettings)
    await database.insert(customShellSettings).values({
      key: "default",
      settings: {
        appName: "Note",
        memberSections: [
          { id: "home", title: "Home", entries: [item("home", "/home"), item("item-note-videos", "/videos")] },
        ],
      },
      createdAt: at,
      updatedAt: at,
    })

    await runMigration()

    const [row] = await database.select().from(customShellSettings)
    const settings = row.settings as { appName: string; memberSections: { entries: { id: string }[] }[] }
    expect(settings.appName).toBe("Note")
    expect(settings.memberSections[0].entries.map((entry) => entry.id)).toEqual([
      "home",
      "item-note-videos",
      "item-note-notes",
    ])
  })

  it("adds it once however often it runs, and leaves a menu that has it", async () => {
    const saved = {
      sections: [
        {
          id: "one",
          title: "One",
          entries: [{ ...item("tools", "/tools"), children: [{ id: "mine", href: "/notes", label: "Mine" }] }],
        },
      ],
    }
    const has = await insertWorkspace(database, { settings: saved })
    const fresh = await insertWorkspace(database, {
      settings: { sections: [{ id: "one", title: "One", entries: [item("a", "/a")] }] },
    })

    await runMigration()
    await runMigration()

    const [row] = await database.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, has.id))
    expect(row.settings).toEqual(saved)
    expect((await sectionsOf(fresh.id))[0].entries.map((entry) => entry.id)).toEqual(["a", "item-note-notes"])
  })

  it("leaves a site that has never saved a menu alone", async () => {
    const workspace = await insertWorkspace(database, { settings: {} })
    await runMigration()
    const [row] = await database
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspace.id))
    expect(row.settings).toEqual({})
  })
})
