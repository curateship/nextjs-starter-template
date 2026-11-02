import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { summarizeTimeline, type ProjectTimeline } from "@/lib/video/timeline-schema"

/**
 * Migration 0145: every project becomes a project with one video, which takes
 * the project's own id (workspace/tasks/projects/01-projects-hold-many.md,
 * part 2). Run against the tables as the release before it left them.
 */

const MIGRATION = "0145_video_project_videos.sql"
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

const TIMELINE: ProjectTimeline = {
  aspect: "1:1",
  tracks: [
    {
      id: "t1",
      muted: false,
      clips: [
        { id: "a", kind: "video", name: "a.mp4", startMs: 0, durationMs: 4000, trimStartMs: 0 },
        { id: "b", kind: "video", name: "b.mp4", startMs: 4000, durationMs: 2500.5, trimStartMs: 0 },
      ],
    },
    {
      id: "t2",
      muted: false,
      clips: [{ id: "c", kind: "text", name: "Text", text: "Hi", startMs: 1000, durationMs: 9000, trimStartMs: 0 }],
    },
  ],
}

async function oldProject() {
  await client.query(
    `insert into users (id, email, name, role, password_hash, created_at, updated_at)
       values ('u1', 'a@example.com', 'A', 'admin', 'x', now(), now())`
  )
  await client.query(
    `insert into video_projects (id, user_id, name, aspect, timeline, version, spend_limit_cents, language, created_at, updated_at)
       values ('p1', 'u1', 'Reel', '1:1', $1::jsonb, 7, 500, null, now(), now()),
              ('p2', 'u1', 'Reel (Spanish)', '1:1', $1::jsonb, 1, null, 'Spanish', now(), now())`,
    [JSON.stringify(TIMELINE)]
  )
  await client.query(`update video_projects set language_of = 'p1' where id = 'p2'`)
  await client.query(
    `insert into video_project_versions (id, project_id, user_id, reason, timeline, aspect, clip_count, duration_ms, saved_at, created_at)
       values ('v1', 'p1', 'u1', 'break', $1::jsonb, '1:1', 3, 10000, now(), now())`,
    [JSON.stringify(TIMELINE)]
  )
  await client.query(
    `insert into video_project_thumbnails (project_id, status, storage_path, attempts, checked_at, created_at, updated_at)
       values ('p1', 'ready', 'video/project-thumbnails/u1/p1/x.jpg', 1, now(), now(), now())`
  )
  await client.query(
    `insert into ai_usage_events (id, user_id, provider, model, feature, input_tokens, output_tokens, cost_cents, status, month_start, metadata, created_at)
       values ('e1', 'u1', 'gemini', 'm', 'caption_generation', 0, 0, 12, 'success', '2026-10-01', '{"projectId":"p1"}', now()),
              ('e2', 'u1', 'gemini', 'm', 'viral_breakdown', 0, 0, 3, 'success', '2026-10-01', '{"viralProjectId":"x"}', now())`
  )
}

describe("migration 0145", () => {
  it("makes each project a project with one video holding its timeline", async () => {
    await oldProject()
    await migrate()

    const [video] = await rows<{
      id: string
      project_id: string
      name: string
      aspect: string
      version: number
      clip_count: number
      duration_ms: number
      spend_limit_cents: number | null
    }>("select * from video_project_videos where id = 'p1'")
    const stats = summarizeTimeline(TIMELINE)
    expect(video).toMatchObject({
      project_id: "p1",
      name: "Reel",
      aspect: "1:1",
      version: 7,
      spend_limit_cents: 500,
      clip_count: stats.clipCount,
      duration_ms: Math.round(stats.durationMs),
    })
    const [copy] = await rows<{ language_of: string; language: string }>(
      "select language_of, language from video_project_videos where id = 'p2'"
    )
    expect(copy).toEqual({ language_of: "p1", language: "Spanish" })
  })

  it("gives history, the picture and AI spend to the video", async () => {
    await oldProject()
    await migrate()

    expect(await rows("select video_id from video_project_versions")).toEqual([{ video_id: "p1" }])
    expect(await rows("select video_id, status from video_video_thumbnails")).toEqual([
      { video_id: "p1", status: "ready" },
    ])
    const meter = await rows<{ id: string; video: string | null }>(
      "select id, metadata ->> 'videoId' as video from ai_usage_events order by id"
    )
    expect(meter).toEqual([
      { id: "e1", video: "p1" },
      { id: "e2", video: null },
    ])
  })

  it("lets the release before it keep writing during a deploy", async () => {
    await oldProject()
    await migrate()

    // The old release names only the project; the video id is filled in.
    await client.query(
      `insert into video_editor_windows (project_id, window_id, mode, opened_at, seen_at)
         values ('p1', 'w1', 'edit', now(), now())`
    )
    await client.query(
      `insert into video_render_jobs (id, user_id, kind, project_id, status, quality, aspect, created_at, updated_at)
         values ('j1', 'u1', 'video', 'p1', 'queued', 'high', '9:16', now(), now())`
    )
    expect(await rows("select video_id from video_editor_windows")).toEqual([{ video_id: "p1" }])
    expect(await rows("select video_id from video_render_jobs")).toEqual([{ video_id: "p1" }])
    // Its columns are still there, so it still reads.
    expect(await rows("select timeline is not null as kept from video_projects where id = 'p1'")).toEqual([
      { kept: true },
    ])
  })

  it("can run twice", async () => {
    await oldProject()
    await migrate()
    await migrate()
    expect(await rows("select count(*)::int as total from video_project_videos")).toEqual([{ total: 2 }])
  })
})
