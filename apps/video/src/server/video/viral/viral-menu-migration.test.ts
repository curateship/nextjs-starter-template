import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

/** Migration 0115: Favourites becomes a sub-link of Viral in the left menu. */

const MIGRATION = "0115_video_menu_favourites.sql"
const folder = new URL("../../../../drizzle/", import.meta.url)
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

async function addWorkspace(id: string, sections: unknown) {
  await client.query(
    "insert into workspaces (id, name, subdomain, settings, created_at, updated_at) values ($1, 'W', $2, $3::jsonb, now(), now())",
    [id, `w-${id}`, JSON.stringify({ sections })]
  )
}

async function hrefs(id: string) {
  const { rows } = await client.query<{ settings: { sections: { entries: { href?: string; children?: { href: string }[]; roles?: string[]; icon?: string }[] }[] } }>(
    "select settings from workspaces where id = $1",
    [id]
  )
  return rows[0].settings.sections[0].entries
}

describe("the Favourites link", () => {
  it("is the first sub-link of a top-level Viral link", async () => {
    await addWorkspace("top", [
      {
        entries: [
          { id: "a", type: "item", label: "Editor", href: "/admin/video-editor" },
          { id: "b", type: "item", label: "Viral", href: "/admin/video-viral", roles: ["admin"] },
          { id: "c", type: "item", label: "Settings", href: "/admin/settings" },
        ],
      },
    ])
    await migrate()
    const entries = await hrefs("top")
    expect(entries.map((entry) => entry.href)).toEqual([
      "/admin/video-editor",
      "/admin/video-viral",
      "/admin/settings",
    ])
    expect(entries[1].children?.map((child) => child.href)).toEqual([
      "/admin/video-favourites",
    ])
    // Viral keeps its roles; the sub-link is seen by whoever sees Viral.
    expect(entries[1].roles).toEqual(["admin"])
  })

  it("goes first among sub-links Viral already has", async () => {
    await addWorkspace("kids", [
      {
        entries: [
          {
            id: "b",
            type: "item",
            label: "Viral",
            href: "/admin/video-viral",
            children: [{ id: "x", label: "Other", href: "/admin/other" }],
          },
        ],
      },
    ])
    await migrate()
    const [viral] = await hrefs("kids")
    expect(viral.children?.map((child) => child.href)).toEqual([
      "/admin/video-favourites",
      "/admin/other",
    ])
  })

  it("sits right after Viral when Viral is itself a sub-link", async () => {
    await addWorkspace("child", [
      {
        entries: [
          {
            id: "g",
            type: "item",
            label: "Video",
            href: "/admin/video-editor",
            children: [
              { id: "v", label: "Viral", href: "/admin/video-viral" },
              { id: "e", label: "Exports", href: "/admin/video-exports" },
            ],
          },
        ],
      },
    ])
    await migrate()
    const [group] = await hrefs("child")
    expect(group.children?.map((child) => child.href)).toEqual([
      "/admin/video-viral",
      "/admin/video-favourites",
      "/admin/video-exports",
    ])
  })

  it("leaves a menu with no Viral link, or one that already has Favourites, alone", async () => {
    const plain = [{ entries: [{ id: "a", type: "item", label: "Editor", href: "/admin/video-editor" }] }]
    await addWorkspace("none", plain)
    await migrate()
    await migrate()
    expect((await hrefs("none")).map((entry) => entry.href)).toEqual(["/admin/video-editor"])
  })
})
