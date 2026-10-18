import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertWorkspace } from "@/server/test-support"

/**
 * Migration 0097 puts a Videos link in every saved left menu, right after the
 * first entry of the first section, and leaves alone a menu that already
 * links to /videos. Run here against menus saved before it, the way a real
 * database meets it.
 */

const MIGRATION = new URL("../../../drizzle/0097_note_videos_menu.sql", import.meta.url)
const VIDEOS = {
  type: "item",
  id: "item-note-videos",
  href: "/videos",
  label: "Videos",
  icon: "video",
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

describe("the Videos menu link", () => {
  it("goes after the first entry of each admin menu's first section", async () => {
    const workspace = await insertWorkspace(database, {
      settings: {
        sections: [
          { id: "one", title: "One", entries: [item("overview", "/admin/dashboard"), item("ai", "/admin/ai")] },
          { id: "two", title: "Two", entries: [item("pages", "/admin/pages")] },
        ],
      },
    })

    await runMigration()

    const [row] = await database
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspace.id))
    const sections = (row.settings as { sections: { entries: { id: string }[] }[] }).sections
    expect(sections[0].entries.map((entry) => entry.id)).toEqual(["overview", "item-note-videos", "ai"])
    expect(sections[0].entries[1]).toEqual(VIDEOS)
    expect(sections[1].entries.map((entry) => entry.id)).toEqual(["pages"])
  })

  it("goes into the members' menu too", async () => {
    const at = now()
    await database.delete(customShellSettings)
    await database.insert(customShellSettings).values({
      key: "default",
      settings: {
        appName: "Note",
        memberSections: [{ id: "updates", title: "Updates", entries: [item("changelog", "/changelog")] }],
      },
      createdAt: at,
      updatedAt: at,
    })

    await runMigration()

    const [row] = await database.select().from(customShellSettings)
    const settings = row.settings as {
      appName: string
      memberSections: { entries: { id: string }[] }[]
    }
    expect(settings.appName).toBe("Note")
    expect(settings.memberSections[0].entries.map((entry) => entry.id)).toEqual([
      "changelog",
      "item-note-videos",
    ])
  })

  it("leaves a menu that already links to /videos, even as a sub-link", async () => {
    const saved = {
      sections: [
        {
          id: "one",
          title: "One",
          entries: [
            { ...item("tools", "/tools"), children: [{ id: "mine", href: "/videos", label: "Mine" }] },
          ],
        },
      ],
    }
    const workspace = await insertWorkspace(database, { settings: saved })

    await runMigration()
    await runMigration()

    const [row] = await database
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspace.id))
    expect(row.settings).toEqual(saved)
  })

  it("adds it once however often it runs", async () => {
    const workspace = await insertWorkspace(database, {
      settings: { sections: [{ id: "one", title: "One", entries: [item("a", "/a")] }] },
    })

    await runMigration()
    await runMigration()

    const [row] = await database
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspace.id))
    const sections = (row.settings as { sections: { entries: { id: string }[] }[] }).sections
    expect(sections[0].entries.map((entry) => entry.id)).toEqual(["a", "item-note-videos"])
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
