import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

/**
 * Migration 0146: every person's carousels go into one carousel project,
 * "My carousels", and each carousel's picture shelf joins the project's
 * (workspace/tasks/projects/01-projects-hold-many.md, parts 18 and 21). Run
 * against the tables as the release before it left them.
 */

const MIGRATION = "0146_video_carousel_projects.sql"
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

async function rows<T>(query: string): Promise<T[]> {
  return (await client.query<T>(query)).rows
}

const SLIDES = JSON.stringify([{ id: "s1", title: "Hook", backgroundColor: "#111827", items: [] }])

/** Two people: Ann with two carousels sharing a picture, Bo with one. */
async function oldCarousels() {
  await client.exec(`
    insert into users (id, email, name, role, password_hash, created_at, updated_at) values
      ('ann', 'ann@example.com', 'Ann', 'admin', 'x', now(), now()),
      ('bo', 'bo@example.com', 'Bo', 'admin', 'x', now(), now());
    insert into workspaces (id, user_id, name, subdomain, created_at, updated_at) values
      ('w1', 'ann', 'Ann', 'ann', now(), now());
    insert into media (id, workspace_id, user_id, filename, original_name, file_size, mime_type, file_type, storage_path, created_at, updated_at) values
      ('m1', 'w1', 'ann', 'a.png', 'a.png', 8, 'image/png', 'image', 'ann/a.png', now(), now()),
      ('m2', 'w1', 'ann', 'b.png', 'b.png', 8, 'image/png', 'image', 'ann/b.png', now(), now());
  `)
  await client.query(
    `insert into video_carousels (id, user_id, name, format, slides, created_at, updated_at) values
       ('c1', 'ann', 'One', '4:5', $1::jsonb, now(), now()),
       ('c2', 'ann', 'Two', '1:1', $1::jsonb, now(), now()),
       ('c3', 'bo', 'Three', '4:5', $1::jsonb, now(), now())`,
    [SLIDES]
  )
  await client.exec(`
    insert into video_carousel_media (carousel_id, media_id, created_at) values
      ('c1', 'm1', now()), ('c2', 'm1', now()), ('c2', 'm2', now());
  `)
}

describe("migration 0146", () => {
  it("puts each person's carousels into one My carousels project", async () => {
    await oldCarousels()
    await migrate()
    const projects = await rows<{ user_id: string; name: string; carousels: number }>(
      `select p.user_id, p.name, count(c.id)::int as carousels
         from video_carousel_projects p join video_carousels c on c.carousel_project_id = p.id
        group by p.id order by p.user_id`
    )
    expect(projects).toEqual([
      { user_id: "ann", name: "My carousels", carousels: 2 },
      { user_id: "bo", name: "My carousels", carousels: 1 },
    ])
    expect(await rows("select status from video_carousels group by status")).toEqual([{ status: "draft" }])
  })

  it("joins every carousel's shelf into its project's, once each", async () => {
    await oldCarousels()
    await migrate()
    expect(
      await rows("select media_id from video_carousel_project_media order by media_id")
    ).toEqual([{ media_id: "m1" }, { media_id: "m2" }])
  })

  it("lets the release before it keep writing during a deploy", async () => {
    await oldCarousels()
    await migrate()
    // The old release names no carousel project, and uploads to one carousel's shelf.
    await client.query(
      `insert into video_carousels (id, user_id, name, format, slides, created_at, updated_at)
         values ('c4', 'ann', 'Four', '4:5', $1::jsonb, now(), now())`,
      [SLIDES]
    )
    await client.exec(`
      insert into media (id, workspace_id, user_id, filename, original_name, file_size, mime_type, file_type, storage_path, created_at, updated_at)
        values ('m3', 'w1', 'ann', 'c.png', 'c.png', 8, 'image/png', 'image', 'ann/c.png', now(), now());
      insert into video_carousel_media (carousel_id, media_id, created_at) values ('c4', 'm3', now());
    `)
    const [placed] = await rows<{ same: boolean }>(
      `select (select carousel_project_id from video_carousels where id = 'c4')
            = (select carousel_project_id from video_carousels where id = 'c1') as same`
    )
    expect(placed.same).toBe(true)
    expect(await rows("select count(*)::int as total from video_carousel_project_media")).toEqual([{ total: 3 }])
  })

  it("makes My carousels for someone with none, during a deploy", async () => {
    await migrate()
    await client.exec(`
      insert into users (id, email, name, role, password_hash, created_at, updated_at)
        values ('cy', 'cy@example.com', 'Cy', 'admin', 'x', now(), now());
    `)
    await client.query(
      `insert into video_carousels (id, user_id, name, format, slides, created_at, updated_at)
         values ('c5', 'cy', 'Five', '4:5', $1::jsonb, now(), now())`,
      [SLIDES]
    )
    expect(await rows("select name from video_carousel_projects where user_id = 'cy'")).toEqual([
      { name: "My carousels" },
    ])
  })

  it("can run twice", async () => {
    await oldCarousels()
    await migrate()
    await migrate()
    expect(await rows("select count(*)::int as total from video_carousel_projects")).toEqual([{ total: 2 }])
    expect(await rows("select count(*)::int as total from video_carousel_project_media")).toEqual([{ total: 2 }])
  })
})
