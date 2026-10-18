import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

/**
 * Migration 0114 against a database that still has the old Viral searches and
 * creator folders in it, the way the live database will. Every migration
 * before it is replayed first, then old rows are written, then 0114 runs.
 */

const MIGRATION = "0114_video_viral_projects.sql"
let client: PGlite

beforeEach(async () => {
  client = new PGlite()
  const folder = new URL("../../../../drizzle/", import.meta.url)
  const files = (await readdir(folder)).filter((file) => file.endsWith(".sql")).sort()
  for (const file of files) {
    if (file >= MIGRATION) break
    await client.exec(await readFile(new URL(file, folder), "utf8"))
  }
})

afterEach(async () => {
  await client.close()
})

async function runMigration() {
  const folder = new URL("../../../../drizzle/", import.meta.url)
  await client.exec(await readFile(new URL(MIGRATION, folder), "utf8"))
}

async function rows<T>(query: string): Promise<T[]> {
  return (await client.query<T>(query)).rows
}

describe("moving the old Viral page and Creators page into projects", () => {
  it("keeps every saved search, every followed creator and the menu tidy", async () => {
    await client.exec(`
      insert into users (id, email, name, role, password_hash, created_at, updated_at)
        values ('u1', 'a@example.com', 'A', 'admin', 'x', now(), now()),
               ('u2', 'b@example.com', 'B', 'admin', 'x', now(), now());
      insert into video_viral_searches values
        ('s1', 'u1', 'gym tips', 'youtube', 7, 0, now(), 102, now()),
        ('s2', 'u1', 'meal prep', 'youtube', 30, 0, now(), 102, now());
      insert into video_viral_results values
        ('r1', 's1', 'youtube', 'v1', 'https://www.youtube.com/shorts/v1', 'One', 'c', 'C', 1, 10, 1, 1, now(), 30, null),
        ('r2', 's2', 'youtube', 'v2', 'https://www.youtube.com/shorts/v2', 'Two', 'c', 'C', 1, 10, 1, 1, now(), 30, null);
      insert into video_creators (id, owner_id, platform, handle, profile_url, watch, created_at, updated_at) values
        ('c1', 'u1', 'tiktok', 'zachking', 'https://www.tiktok.com/@zachking', true, now(), now()),
        ('c2', 'u1', 'tiktok', 'loose', 'https://www.tiktok.com/@loose', true, now(), now()),
        ('c3', 'u2', 'tiktok', 'theirs', 'https://www.tiktok.com/@theirs', true, now(), now());
      insert into video_creator_folders values ('f1', 'u1', 'Magic', 0, false, now(), now());
      insert into video_creator_folder_creators values ('f1', 'c1');
    `)

    await runMigration()

    const projects = await rows<{ owner_id: string; name: string; keywords: number; results: number; creators: number; units_spent: number }>(`
      select p.owner_id, p.name, p.units_spent,
        (select count(*)::int from video_viral_project_keywords k where k.project_id = p.id) as keywords,
        (select count(*)::int from video_viral_project_results r where r.project_id = p.id) as results,
        (select count(*)::int from video_viral_project_creators c where c.project_id = p.id) as creators
      from video_viral_projects p order by p.owner_id, p.name
    `)
    expect(projects).toEqual([
      { owner_id: "u1", name: "Earlier searches", units_spent: 204, keywords: 2, results: 2, creators: 0 },
      { owner_id: "u1", name: "Followed creators", units_spent: 0, keywords: 0, results: 0, creators: 1 },
      { owner_id: "u1", name: "Magic", units_spent: 0, keywords: 0, results: 0, creators: 1 },
      { owner_id: "u2", name: "Followed creators", units_spent: 0, keywords: 0, results: 0, creators: 1 },
    ])

    // Every followed creator ends up in at least one project.
    const loose = await rows(`
      select id from video_creators c
      where not exists (select 1 from video_viral_project_creators l where l.creator_id = c.id)
    `)
    expect(loose).toEqual([])

    const oldTables = await rows(`
      select table_name from information_schema.tables
      where table_name in ('video_viral_searches', 'video_viral_results', 'video_creator_folders', 'video_creator_folder_creators')
    `)
    expect(oldTables).toEqual([])
  })

  it("takes the Creators link out of the left menu and keeps Viral", async () => {
    await client.exec(`
      insert into workspaces (id, name, subdomain, settings, created_at, updated_at)
      values ('w1', 'W', 'www', '{"sections":[{"entries":[
        {"id":"a","type":"item","label":"Viral","href":"/admin/video-viral"},
        {"id":"b","type":"item","label":"Creators","href":"/admin/video-creators"},
        {"id":"c","type":"group","label":"Video","children":[
          {"id":"d","type":"item","label":"Creators","href":"/admin/video-creators"},
          {"id":"e","type":"item","label":"Editor","href":"/admin/video-editor"}
        ]}
      ]}]}'::jsonb, now(), now())
    `)
    await runMigration()
    const [workspace] = await rows<{ settings: string }>(`select settings::text as settings from workspaces where id = 'w1'`)
    expect(workspace.settings).not.toContain("/admin/video-creators")
    expect(workspace.settings).toContain("/admin/video-viral")
    expect(workspace.settings).toContain("/admin/video-editor")
  })
})
