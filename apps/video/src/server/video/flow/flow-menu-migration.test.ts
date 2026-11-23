import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

/** Migration 0174: Flow's link goes straight after the top-level Video editor link. */

const MIGRATION = "0174_video_menu_flow.sql"
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

type Entry = { href?: string; label?: string; icon?: string; roles?: string[]; children?: { href: string }[] }

async function entries(id: string) {
  const { rows } = await client.query<{ settings: { sections: { entries: Entry[] }[] } }>(
    "select settings from workspaces where id = $1",
    [id]
  )
  return rows[0].settings.sections.map((section) => section.entries)
}

const EDITOR = {
  id: "a",
  type: "item",
  label: "Video editor",
  href: "/admin/video-editor",
  children: [{ id: "x", href: "/admin/video-exports", label: "Exports" }],
}

describe("the Flow link", () => {
  it("goes straight after a top-level Video editor link, for admins", async () => {
    await addWorkspace("top", [
      { entries: [EDITOR, { id: "b", type: "item", label: "Carousels", href: "/admin/video-carousels" }] },
    ])
    await migrate()
    const [menu] = await entries("top")
    expect(menu.map((entry) => entry.href)).toEqual(["/admin/video-editor", "/admin/video-flow", "/admin/video-carousels"])
    expect(menu[1]).toMatchObject({ label: "Flow", icon: "workflow", roles: ["admin"] })
    expect(menu[0].children).toHaveLength(1)
  })

  it("is added once, however often the migration runs", async () => {
    await addWorkspace("twice", [{ entries: [EDITOR] }])
    await migrate()
    await migrate()
    const [menu] = await entries("twice")
    expect(menu.filter((entry) => entry.href === "/admin/video-flow")).toHaveLength(1)
  })

  it("leaves a menu with no top-level Video editor link alone", async () => {
    await addWorkspace("none", [
      { entries: [{ id: "c", type: "item", label: "Admin", href: "/admin/dashboard", children: [EDITOR] }] },
    ])
    await migrate()
    const [menu] = await entries("none")
    expect(menu.map((entry) => entry.href)).toEqual(["/admin/dashboard"])
  })
})
