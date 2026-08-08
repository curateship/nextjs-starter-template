import { PGlite } from "@electric-sql/pglite"
import { eq, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import {
  NO_QUEUED_EXPORT_MESSAGE,
  NOTHING_TO_EXPORT_MESSAGE,
} from "@/lib/video/render"
import { type ProjectTimeline } from "@/lib/video/timeline-schema"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { createOwnedProject, writeProjectTimeline } from "@/server/video/projects"
import {
  cancelRenderJob,
  enqueueRenderJob,
  getLatestRenderJob,
} from "@/server/video/render-queue"
import { videoRenderJobs } from "@/server/video/schema"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

/** A project with something on its timeline, so it can be exported. */
async function projectWithContent(ownerId = user.id) {
  const project = await createOwnedProject(ownerId, "Reel", database)
  await writeProjectTimeline(
    ownerId,
    project.id,
    {
      aspect: "9:16",
      tracks: [
        {
          id: "track-1",
          muted: false,
          clips: [
            {
              id: "clip-1",
              kind: "text",
              name: "Text",
              text: "Hello",
              fontId: "inter",
              startMs: 0,
              durationMs: 3000,
              trimStartMs: 0,
            },
          ],
        },
      ],
    } satisfies ProjectTimeline as never,
    project.version,
    database
  )
  return project
}

describe("asking for an export", () => {
  it("refuses a project with nothing on the timeline", async () => {
    const empty = await createOwnedProject(user.id, "Empty", database)
    await expect(
      enqueueRenderJob({
        userId: user.id,
        projectId: empty.id,
        quality: "high",
        database,
      })
    ).rejects.toThrowError(NOTHING_TO_EXPORT_MESSAGE)
  })

  it("refuses somebody else's project", async () => {
    const stranger = await insertUser(database)
    const theirs = await projectWithContent(stranger.id)
    await expect(
      enqueueRenderJob({
        userId: user.id,
        projectId: theirs.id,
        quality: "high",
        database,
      })
    ).rejects.toThrowError(PROJECT_NOT_FOUND_MESSAGE)
  })

  it("queues one, and asking again hands back the same one", async () => {
    const project = await projectWithContent()
    const first = await enqueueRenderJob({
      userId: user.id,
      projectId: project.id,
      quality: "high",
      database,
    })
    expect(first.status).toBe("queued")
    expect(first.title).toBe("Reel")

    const second = await enqueueRenderJob({
      userId: user.id,
      projectId: project.id,
      quality: "low",
      database,
    })
    expect(second.id).toBe(first.id)
    // Still the first one's settings — asking twice does not start a second.
    expect(second.quality).toBe("high")

    const rows = await database.select().from(videoRenderJobs)
    expect(rows).toHaveLength(1)
  })

  it("takes the name it is given, and the project's own when it is given none", async () => {
    const project = await projectWithContent()
    const named = await enqueueRenderJob({
      userId: user.id,
      projectId: project.id,
      quality: "high",
      title: "  Launch cut  ",
      database,
    })
    expect(named.title).toBe("Launch cut")

    // Finish it so a second can be asked for.
    await database
      .update(videoRenderJobs)
      .set({ status: "ready", storagePath: "video/exports/named.mp4" })
      .where(eq(videoRenderJobs.id, named.id))

    const unnamed = await enqueueRenderJob({
      userId: user.id,
      projectId: project.id,
      quality: "high",
      title: "   ",
      database,
    })
    expect(unnamed.title).toBe("Reel")
  })

  it("remembers whether to even out the sound, so a later settings change cannot rewrite it", async () => {
    const project = await projectWithContent()
    const job = await enqueueRenderJob({
      userId: user.id,
      projectId: project.id,
      quality: "high",
      normalizeLoudness: false,
      database,
    })
    const [row] = await database
      .select()
      .from(videoRenderJobs)
      .where(eq(videoRenderJobs.id, job.id))
    expect(row.normalizeLoudness).toBe(false)
  })

  it("says where in the queue it is", async () => {
    const first = await projectWithContent()
    const second = await projectWithContent()
    await enqueueRenderJob({
      userId: user.id,
      projectId: first.id,
      quality: "high",
      database,
    })
    const later = await enqueueRenderJob({
      userId: user.id,
      projectId: second.id,
      quality: "high",
      database,
    })
    expect(later.queue_position).toBe(2)
  })
})

describe("stopping one", () => {
  it("stops a waiting export", async () => {
    const project = await projectWithContent()
    await enqueueRenderJob({
      userId: user.id,
      projectId: project.id,
      quality: "high",
      database,
    })
    const after = await cancelRenderJob(user.id, project.id, database)
    expect(after?.status).toBe("cancelled")
  })

  it("says so plainly when there is nothing waiting", async () => {
    const project = await projectWithContent()
    await expect(
      cancelRenderJob(user.id, project.id, database)
    ).rejects.toThrowError(NO_QUEUED_EXPORT_MESSAGE)
  })

  it("leaves one that is already rendering alone", async () => {
    const project = await projectWithContent()
    const job = await enqueueRenderJob({
      userId: user.id,
      projectId: project.id,
      quality: "high",
      database,
    })
    await database
      .update(videoRenderJobs)
      .set({ status: "running" })
      .where(eq(videoRenderJobs.id, job.id))

    await expect(
      cancelRenderJob(user.id, project.id, database)
    ).rejects.toThrowError(NO_QUEUED_EXPORT_MESSAGE)
  })
})

describe("what the editor watches", () => {
  it("has nothing to show before anything is asked for", async () => {
    const project = await projectWithContent()
    expect(await getLatestRenderJob(user.id, project.id, database)).toBeNull()
  })

  it("shows the newest one for that project", async () => {
    const project = await projectWithContent()
    const first = await enqueueRenderJob({
      userId: user.id,
      projectId: project.id,
      quality: "high",
      database,
    })
    // Finish it so a second can be asked for.
    await database
      .update(videoRenderJobs)
      .set({ status: "ready", storagePath: "video/exports/x.mp4" })
      .where(eq(videoRenderJobs.id, first.id))
    const second = await enqueueRenderJob({
      userId: user.id,
      projectId: project.id,
      quality: "low",
      database,
    })

    const latest = await getLatestRenderJob(user.id, project.id, database)
    expect(latest?.id).toBe(second.id)
  })
})

describe("one at a time per project", () => {
  it("the database refuses a second active export outright", async () => {
    const project = await projectWithContent()
    await enqueueRenderJob({
      userId: user.id,
      projectId: project.id,
      quality: "high",
      database,
    })
    // Going around the queue's own check, straight at the table: the index is
    // what makes this safe when two requests arrive at the same instant.
    await expect(
      database.execute(sql`
        insert into video_render_jobs
          (id, user_id, project_id, status, quality, created_at, updated_at)
        values ('second', ${user.id}, ${project.id}, 'queued', 'high', now(), now())
      `)
    ).rejects.toThrow()
  })
})
