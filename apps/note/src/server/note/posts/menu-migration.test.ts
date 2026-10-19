import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellSettings, customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertWorkspace } from "@/server/test-support"

/**
 * Migration 0101 puts a Posts link in every saved left menu, right after the
 * Notes link, else right after the Videos link, else after the first entry,
 * and leaves alone a menu that already links to /posts.
 */

const MIGRATION = new URL("../../../../drizzle/0101_note_posts_menu.sql", import.meta.url)
const POSTS = {
  type: "item",
  id: "item-note-posts",
  href: "/posts",
  label: "Posts",
  icon: "message-square-quote",
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

async function idsOf(workspaceId: string, section = 0) {
  const [row] = await database.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspaceId))
  return (row.settings as { sections: { entries: { id: string }[] }[] }).sections[section].entries.map(
    (entry) => entry.id
  )
}

describe("the Posts menu link", () => {
  it("goes right after the Notes link, in whichever section holds it", async () => {
    const workspace = await insertWorkspace(database, {
      settings: {
        sections: [
          { id: "one", title: "One", entries: [item("overview", "/admin/dashboard")] },
          {
            id: "two",
            title: "Two",
            entries: [item("item-note-videos", "/videos"), item("item-note-notes", "/notes"), item("ai", "/admin/ai")],
          },
        ],
      },
    })
    await runMigration()
    expect(await idsOf(workspace.id, 0)).toEqual(["overview"])
    expect(await idsOf(workspace.id, 1)).toEqual(["item-note-videos", "item-note-notes", "item-note-posts", "ai"])
    const [row] = await database.select().from(customShellWorkspaces).where(eq(customShellWorkspaces.id, workspace.id))
    expect((row.settings as { sections: { entries: unknown[] }[] }).sections[1].entries[2]).toEqual(POSTS)
  })

  it("goes after Videos when there is no Notes link, and after the first entry when there is neither", async () => {
    const withVideos = await insertWorkspace(database, {
      settings: { sections: [{ id: "one", title: "One", entries: [item("item-note-videos", "/videos"), item("b", "/b")] }] },
    })
    const bare = await insertWorkspace(database, {
      settings: { sections: [{ id: "one", title: "One", entries: [item("a", "/a"), item("b", "/b")] }] },
    })
    await runMigration()
    expect(await idsOf(withVideos.id)).toEqual(["item-note-videos", "item-note-posts", "b"])
    expect(await idsOf(bare.id)).toEqual(["a", "item-note-posts", "b"])
  })

  it("goes into the members' menu after Notes too", async () => {
    const at = now()
    await database.delete(customShellSettings)
    await database.insert(customShellSettings).values({
      key: "default",
      settings: {
        appName: "Note",
        memberSections: [
          { id: "home", title: "Home", entries: [item("home", "/home"), item("item-note-notes", "/notes")] },
        ],
      },
      createdAt: at,
      updatedAt: at,
    })
    await runMigration()
    const [row] = await database.select().from(customShellSettings)
    const settings = row.settings as { appName: string; memberSections: { entries: { id: string }[] }[] }
    expect(settings.appName).toBe("Note")
    expect(settings.memberSections[0].entries.map((entry) => entry.id)).toEqual(["home", "item-note-notes", "item-note-posts"])
  })

  it("adds it once however often it runs, and leaves a menu that has it", async () => {
    const saved = {
      sections: [
        {
          id: "one",
          title: "One",
          entries: [{ ...item("tools", "/tools"), children: [{ id: "mine", href: "/posts", label: "Mine" }] }],
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
    expect(await idsOf(fresh.id)).toEqual(["a", "item-note-posts"])
  })
})
