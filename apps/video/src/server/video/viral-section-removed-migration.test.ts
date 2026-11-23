import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

/**
 * Migration 0154: Video's Viral section goes, now that Viral is its own app.
 * The saved viral videos that editor videos copy stay, for the Copy panel.
 */

const MIGRATION = "0154_video_viral_section_removed.sql"
const folder = new URL("../../../drizzle/", import.meta.url)
let client: PGlite

beforeEach(async () => {
  client = new PGlite()
  const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort()
  for (const file of files) {
    if (file >= MIGRATION) break
    await client.exec(await readFile(new URL(file, folder), "utf8"))
  }
})

afterEach(async () => {
  await client.close()
})

async function migrate() {
  await client.exec(await readFile(new URL(MIGRATION, folder), "utf8"))
}

type Entry = { id: string; href?: string; label?: string; children?: Entry[] }

async function addWorkspace(id: string, entries: Entry[]) {
  await client.query(
    "insert into workspaces (id, name, subdomain, settings, created_at, updated_at) values ($1, 'W', $2, $3::jsonb, now(), now())",
    [id, `w-${id}`, JSON.stringify({ sections: [{ entries }] })]
  )
}

async function entries(id: string): Promise<Entry[]> {
  const { rows } = await client.query<{ settings: { sections: { entries: Entry[] }[] } }>(
    "select settings from workspaces where id = $1",
    [id]
  )
  return rows[0].settings.sections[0].entries
}

async function tableExists(name: string) {
  const { rows } = await client.query<{ found: string | null }>(
    "select to_regclass($1)::text as found",
    [name]
  )
  return rows[0].found !== null
}

async function columnExists(table: string, column: string) {
  const { rows } = await client.query(
    "select 1 from information_schema.columns where table_name = $1 and column_name = $2",
    [table, column]
  )
  return rows.length > 0
}

describe("the home page", () => {
  it("goes back to the default when it was a removed page, and is kept otherwise", async () => {
    await client.query(
      "insert into settings (key, settings, created_at, updated_at) values ('default', $1::jsonb, now(), now())",
      [JSON.stringify({ appName: "Video", adminRoute: "/admin/video-viral/p-1?open=x", memberHomeRoute: "/admin/video-viral-ish" })]
    )
    await migrate()
    const { rows } = await client.query<{ settings: Record<string, string> }>("select settings from settings")
    expect(rows[0]!.settings).toEqual({ appName: "Video", adminRoute: "", memberHomeRoute: "/admin/video-viral-ish" })
  })

  it("clears a Favourites home for members too", async () => {
    await client.query(
      "insert into settings (key, settings, created_at, updated_at) values ('default', $1::jsonb, now(), now())",
      [JSON.stringify({ adminRoute: "/admin/media", memberHomeRoute: "/admin/video-favourites" })]
    )
    await migrate()
    const { rows } = await client.query<{ settings: Record<string, string> }>("select settings from settings")
    expect(rows[0]!.settings).toEqual({ adminRoute: "/admin/media", memberHomeRoute: "" })
  })
})

describe("the left menu", () => {
  it("leaves settings alone when a removed address sits outside any menu", async () => {
    const settings = { brand: "W", note: "/admin/video-viral" }
    await client.query(
      "insert into workspaces (id, name, subdomain, settings, created_at, updated_at) values ('bare', 'W', 'w-bare', $1::jsonb, now(), now())",
      [JSON.stringify(settings)]
    )
    await migrate()
    const { rows } = await client.query<{ settings: unknown }>("select settings from workspaces where id = 'bare'")
    expect(rows[0].settings).toEqual(settings)
  })

  it("keeps an empty menu empty when a removed address sits elsewhere in settings", async () => {
    // A fresh site saves `sections: []`. Only `sections` is cleaned, as in 0115 and 0123.
    const settings = { sections: [], note: "/admin/video-viral" }
    await client.query(
      "insert into workspaces (id, name, subdomain, settings, created_at, updated_at) values ('empty', 'W', 'w-empty', $1::jsonb, now(), now())",
      [JSON.stringify(settings)]
    )
    await migrate()
    const { rows } = await client.query<{ settings: unknown }>("select settings from workspaces where id = 'empty'")
    expect(rows[0].settings).toEqual(settings)
  })

  it("leaves sub-links that are not a list, and sections without entries, as they are", async () => {
    const settings = {
      sections: [
        { title: "No entries" },
        {
          entries: [
            { id: "a", href: "/admin/video-editor", children: null },
            { id: "b", href: "/admin/video-viral", children: null },
          ],
        },
      ],
    }
    await client.query(
      "insert into workspaces (id, name, subdomain, settings, created_at, updated_at) values ('odd', 'W', 'w-odd', $1::jsonb, now(), now())",
      [JSON.stringify(settings)]
    )
    await migrate()
    const { rows } = await client.query<{ settings: unknown }>("select settings from workspaces where id = 'odd'")
    expect(rows[0].settings).toEqual({
      sections: [{ title: "No entries" }, { entries: [{ id: "a", href: "/admin/video-editor", children: null }] }],
    })
  })

  it("loses a top-level Viral link and its Favourites sub-link", async () => {
    await addWorkspace("top", [
      { id: "a", href: "/admin/video-editor", label: "Editor" },
      {
        id: "b",
        href: "/admin/video-viral",
        label: "Viral",
        children: [{ id: "c", href: "/admin/video-favourites", label: "Favourites" }],
      },
      { id: "d", href: "/admin/settings", label: "Settings" },
    ])
    await migrate()
    expect((await entries("top")).map((entry) => entry.href)).toEqual([
      "/admin/video-editor",
      "/admin/settings",
    ])
  })

  it("keeps a sub-link somebody added under Viral, in Viral's place", async () => {
    await addWorkspace("mine", [
      {
        id: "b",
        href: "/admin/video-viral",
        label: "Viral",
        children: [
          { id: "c", href: "/admin/video-favourites", label: "Favourites" },
          { id: "e", href: "/admin/video-exports", label: "Exports" },
        ],
      },
      { id: "d", href: "/admin/settings", label: "Settings" },
    ])
    await migrate()
    expect((await entries("mine")).map((entry) => entry.href)).toEqual([
      "/admin/video-exports",
      "/admin/settings",
    ])
  })

  it("takes Viral, Favourites and Creators out from under another link", async () => {
    await addWorkspace("nested", [
      {
        id: "a",
        href: "/admin/video-editor",
        label: "Editor",
        children: [
          { id: "b", href: "/admin/video-viral", label: "Viral" },
          { id: "c", href: "/admin/video-favourites", label: "Favourites" },
          { id: "f", href: "/admin/video-creators", label: "Creators" },
          { id: "g", href: "/admin/video-actors", label: "Actors" },
        ],
      },
    ])
    await migrate()
    const [editor] = await entries("nested")
    expect(editor.href).toBe("/admin/video-editor")
    expect(editor.children?.map((child) => child.href)).toEqual(["/admin/video-actors"])
  })

  it("leaves a menu without any of them alone", async () => {
    const menu = [
      { id: "a", href: "/admin/video-editor", label: "Editor" },
      { id: "d", href: "/admin/settings", label: "Settings" },
    ]
    await addWorkspace("plain", menu)
    await migrate()
    expect(await entries("plain")).toEqual(menu)
  })
})

describe("the tables", () => {
  it("drops the Viral section's tables and keeps the saved videos and the connection", async () => {
    await migrate()
    for (const gone of [
      "video_viral_projects",
      "video_viral_project_folders",
      "video_viral_project_keywords",
      "video_viral_project_results",
      "video_viral_project_hidden_channels",
      "video_viral_project_creators",
      "video_viral_project_links",
      "video_viral_collections",
      "video_viral_collection_items",
      "video_creators",
      "video_creator_posts",
      "video_youtube_unit_spend",
    ]) {
      expect(await tableExists(gone), gone).toBe(false)
    }
    for (const kept of ["video_viral_videos", "video_viral_links", "video_viral_arrivals"]) {
      expect(await tableExists(kept), kept).toBe(true)
    }
  })

  it("drops the columns that named a Viral project or held the search key", async () => {
    await migrate()
    expect(await columnExists("video_viral_videos", "viral_project_id")).toBe(false)
    expect(await columnExists("video_project_videos", "source_viral_project_id")).toBe(false)
    expect(await columnExists("video_projects", "source_viral_project_id")).toBe(false)
    expect(await columnExists("video_settings", "youtube_api_key")).toBe(false)
    expect(await columnExists("video_project_videos", "source_viral_video_id")).toBe(true)
    expect(await columnExists("video_project_videos", "source_viral_video_title")).toBe(true)
  })

  it("deletes saved views of Viral projects and keeps the rest", async () => {
    await client.query(
      "insert into users (id, email, name, role, password_hash, created_at, updated_at) values ('u1', 'a@b.test', 'A', 'admin', 'x', now(), now())"
    )
    for (const [id, screen] of [
      ["v1", "viral-project:p1"],
      ["v2", "video-media:editor"],
    ]) {
      await client.query(
        "insert into saved_views (id, user_id, screen, name, filters, created_at, updated_at) values ($1, 'u1', $2, 'View', '{}'::jsonb, now(), now())",
        [id, screen]
      )
    }
    await migrate()
    const { rows } = await client.query<{ screen: string }>("select screen from saved_views")
    expect(rows.map((row) => row.screen)).toEqual(["video-media:editor"])
  })
})
