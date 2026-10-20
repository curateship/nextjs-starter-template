import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

/** Migration 0123: Exports becomes a sub-link of Carousels in the left menu. */

const MIGRATION = "0123_video_menu_carousel_exports.sql"
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

async function addWorkspace(id: string, sections: unknown) {
  await client.query(
    "insert into workspaces (id, name, subdomain, settings, created_at, updated_at) values ($1, 'W', $2, $3::jsonb, now(), now())",
    [id, `w-${id}`, JSON.stringify({ sections })]
  )
}

type Entry = {
  href?: string
  label?: string
  roles?: string[]
  children?: { href: string; label: string }[]
}

async function entries(id: string) {
  const { rows } = await client.query<{
    settings: { sections: { entries: Entry[] }[] }
  }>("select settings from workspaces where id = $1", [id])
  return rows[0].settings.sections[0].entries
}

describe("the Carousel exports link", () => {
  it("is a sub-link named Exports under a top-level Carousels link", async () => {
    await addWorkspace("top", [
      {
        entries: [
          { id: "a", type: "item", label: "Editor", href: "/admin/video-editor" },
          { id: "b", type: "item", label: "Carousels", href: "/admin/video-carousels", roles: ["admin"] },
          { id: "c", type: "item", label: "Settings", href: "/admin/settings" },
        ],
      },
    ])
    await migrate()
    const menu = await entries("top")
    expect(menu.map((entry) => entry.href)).toEqual([
      "/admin/video-editor",
      "/admin/video-carousels",
      "/admin/settings",
    ])
    expect(menu[1].children).toEqual([
      expect.objectContaining({
        href: "/admin/video-carousel-exports",
        label: "Exports",
      }),
    ])
    expect(menu[1].roles).toEqual(["admin"])
  })

  it("goes after sub-links Carousels already has", async () => {
    await addWorkspace("kids", [
      {
        entries: [
          {
            id: "b",
            type: "item",
            label: "Carousels",
            href: "/admin/video-carousels",
            children: [{ id: "x", label: "Other", href: "/admin/other" }],
          },
        ],
      },
    ])
    await migrate()
    const [carousels] = await entries("kids")
    expect(carousels.children?.map((child) => child.href)).toEqual([
      "/admin/other",
      "/admin/video-carousel-exports",
    ])
  })

  it("sits right after Carousels when Carousels is itself a sub-link", async () => {
    await addWorkspace("child", [
      {
        entries: [
          {
            id: "g",
            type: "item",
            label: "Video",
            href: "/admin/video-editor",
            children: [
              { id: "c", label: "Carousels", href: "/admin/video-carousels" },
              { id: "e", label: "Exports", href: "/admin/video-exports" },
            ],
          },
        ],
      },
    ])
    await migrate()
    const [group] = await entries("child")
    expect(group.children?.map((child) => child.href)).toEqual([
      "/admin/video-carousels",
      "/admin/video-carousel-exports",
      "/admin/video-exports",
    ])
  })

  it("leaves a menu with no Carousels link, or one that has the link, alone", async () => {
    await addWorkspace("none", [
      { entries: [{ id: "a", type: "item", label: "Editor", href: "/admin/video-editor" }] },
    ])
    await addWorkspace("twice", [
      { entries: [{ id: "b", type: "item", label: "Carousels", href: "/admin/video-carousels" }] },
    ])
    await migrate()
    await migrate()
    expect((await entries("none")).map((entry) => entry.href)).toEqual([
      "/admin/video-editor",
    ])
    const [carousels] = await entries("twice")
    expect(carousels.children).toHaveLength(1)
  })
})
