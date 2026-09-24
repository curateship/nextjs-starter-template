import { PGlite } from "@electric-sql/pglite"
import { eq, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import {
  NO_ACTIVE_EXPORT_MESSAGE,
  NO_SHAPE_MESSAGE,
  NOTHING_TO_EXPORT_MESSAGE,
  ONLY_FAILED_RETRY_MESSAGE,
  RENDER_NOT_FOUND_MESSAGE,
  shapeBusyMessage,
} from "@/lib/video/render"
import { type ProjectTimeline } from "@/lib/video/timeline-schema"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { createOwnedProject, writeProjectTimeline } from "@/server/video/projects"
import {
  cancelRenderJobs,
  enqueueRenderJobs,
  getLatestRenderJobs,
  retryRenderJob,
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

/** Ask for an export the way the dialog does, with one shape unless told. */
function ask(
  projectId: string,
  overrides: Partial<Parameters<typeof enqueueRenderJobs>[0]> = {}
) {
  return enqueueRenderJobs({
    userId: user.id,
    projectId,
    aspects: ["9:16"],
    quality: "high",
    database,
    ...overrides,
  })
}

/** Finish a job by hand, the way the worker would, so another can be asked for. */
async function finish(jobId: string, status: "ready" | "error" = "ready") {
  await database
    .update(videoRenderJobs)
    .set(
      status === "ready"
        ? { status, storagePath: `video/exports/${jobId}.mp4`, finishedAt: new Date() }
        : { status, errorMessage: "Broke", attempts: 2, finishedAt: new Date() }
    )
    .where(eq(videoRenderJobs.id, jobId))
}

describe("asking for an export", () => {
  it("refuses a project with nothing on the timeline", async () => {
    const empty = await createOwnedProject(user.id, "Empty", database)
    await expect(ask(empty.id)).rejects.toThrowError(NOTHING_TO_EXPORT_MESSAGE)
  })

  it("refuses somebody else's project", async () => {
    const stranger = await insertUser(database)
    const theirs = await projectWithContent(stranger.id)
    await expect(ask(theirs.id)).rejects.toThrowError(PROJECT_NOT_FOUND_MESSAGE)
  })

  it("refuses a press with no shape ticked, and queues nothing", async () => {
    const project = await projectWithContent()
    await expect(ask(project.id, { aspects: [] })).rejects.toThrowError(
      NO_SHAPE_MESSAGE
    )
    expect(await database.select().from(videoRenderJobs)).toHaveLength(0)
  })

  it("queues one, and a second of the same shape is refused plainly", async () => {
    const project = await projectWithContent()
    const [first] = await ask(project.id)
    expect(first.status).toBe("queued")
    expect(first.aspect).toBe("9:16")
    expect(first.title).toBe("Reel")

    await expect(ask(project.id, { quality: "low" })).rejects.toThrowError(
      shapeBusyMessage("9:16")
    )
    expect(await database.select().from(videoRenderJobs)).toHaveLength(1)
  })

  it("queues three shapes of one project from one press", async () => {
    const project = await projectWithContent()
    const jobs = await ask(project.id, { aspects: ["9:16", "1:1", "16:9"] })
    // Listed in the dialog's order, whatever order they were ticked in.
    expect(jobs.map((job) => job.aspect)).toEqual(["9:16", "1:1", "16:9"])
    expect(jobs.every((job) => job.status === "queued")).toBe(true)
    expect(new Set(jobs.map((job) => job.id)).size).toBe(3)
  })

  it("refuses a fourth for a shape already on its way, and queues none of that press", async () => {
    const project = await projectWithContent()
    await ask(project.id, { aspects: ["9:16", "1:1", "16:9"] })
    await expect(
      ask(project.id, { aspects: ["4:3", "1:1"] })
    ).rejects.toThrowError(shapeBusyMessage("1:1"))
    // The 4:3 in the refused press was not queued on its own.
    expect(await database.select().from(videoRenderJobs)).toHaveLength(3)

    // A shape not on its way yet is still fine.
    const jobs = await ask(project.id, { aspects: ["4:3"] })
    expect(jobs).toHaveLength(4)
  })

  it("lets a shape go again once its last export has finished", async () => {
    const project = await projectWithContent()
    const [first] = await ask(project.id)
    await finish(first.id)
    const [second] = await ask(project.id)
    expect(second.id).not.toBe(first.id)
    expect(second.status).toBe("queued")
  })

  it("takes the name it is given, and the project's own when it is given none", async () => {
    const project = await projectWithContent()
    const [named] = await ask(project.id, { title: "  Launch cut  " })
    expect(named.title).toBe("Launch cut")
    await finish(named.id)

    const [unnamed] = await ask(project.id, { title: "   " })
    expect(unnamed.title).toBe("Reel")
  })

  it("remembers whether to even out the sound, so a later settings change cannot rewrite it", async () => {
    const project = await projectWithContent()
    const [job] = await ask(project.id, { normalizeLoudness: false })
    const [row] = await database
      .select()
      .from(videoRenderJobs)
      .where(eq(videoRenderJobs.id, job.id))
    expect(row.normalizeLoudness).toBe(false)
  })

  it("says where in the queue it is", async () => {
    const first = await projectWithContent()
    const second = await projectWithContent()
    await ask(first.id)
    const [later] = await ask(second.id)
    expect(later.queue_position).toBe(2)
  })
})

describe("stopping", () => {
  it("stops a waiting export", async () => {
    const project = await projectWithContent()
    await ask(project.id)
    const [after] = await cancelRenderJobs(user.id, project.id, database)
    expect(after.status).toBe("cancelled")
  })

  it("stops every shape of the project at once", async () => {
    const project = await projectWithContent()
    await ask(project.id, { aspects: ["9:16", "16:9"] })
    const after = await cancelRenderJobs(user.id, project.id, database)
    expect(after.map((job) => job.status)).toEqual(["cancelled", "cancelled"])
  })

  it("says so plainly when there is nothing waiting", async () => {
    const project = await projectWithContent()
    await expect(
      cancelRenderJobs(user.id, project.id, database)
    ).rejects.toThrowError(NO_ACTIVE_EXPORT_MESSAGE)
  })

  it("stops one that is already rendering and lets go of its lease", async () => {
    const project = await projectWithContent()
    const [job] = await ask(project.id)
    await database
      .update(videoRenderJobs)
      .set({
        status: "running",
        leaseToken: "lease-1",
        leaseExpiresAt: new Date(Date.now() + 60_000),
      })
      .where(eq(videoRenderJobs.id, job.id))

    const [after] = await cancelRenderJobs(user.id, project.id, database)
    expect(after.status).toBe("cancelled")
    expect(after.error_message).toBeNull()

    const [row] = await database
      .select()
      .from(videoRenderJobs)
      .where(eq(videoRenderJobs.id, job.id))
    expect(row.leaseToken).toBeNull()
    expect(row.leaseExpiresAt).toBeNull()
    expect(row.finishedAt).not.toBeNull()
  })

  it("leaves a finished export alone", async () => {
    const project = await projectWithContent()
    const [job] = await ask(project.id)
    await finish(job.id, "error")
    await expect(
      cancelRenderJobs(user.id, project.id, database)
    ).rejects.toThrowError(NO_ACTIVE_EXPORT_MESSAGE)
  })

  it("will not stop somebody else's export", async () => {
    const project = await projectWithContent()
    await ask(project.id)
    const stranger = await insertUser(database)
    await expect(
      cancelRenderJobs(stranger.id, project.id, database)
    ).rejects.toThrowError(PROJECT_NOT_FOUND_MESSAGE)
  })
})

describe("trying a failed export again", () => {
  it("puts it back in the queue with no error and a fresh attempt count", async () => {
    const project = await projectWithContent()
    const [job] = await ask(project.id, { aspects: ["1:1"], quality: "low" })
    await finish(job.id, "error")

    const retried = await retryRenderJob(user.id, job.id, database)
    expect(retried.id).toBe(job.id)
    expect(retried.status).toBe("queued")
    expect(retried.error_message).toBeNull()
    expect(retried.finished_at).toBeNull()
    // Asked for exactly as before.
    expect(retried.aspect).toBe("1:1")
    expect(retried.quality).toBe("low")

    const [row] = await database
      .select()
      .from(videoRenderJobs)
      .where(eq(videoRenderJobs.id, job.id))
    expect(row.attempts).toBe(0)
  })

  it("refuses one that is ready, waiting or rendering", async () => {
    const project = await projectWithContent()
    const [waiting] = await ask(project.id, { aspects: ["9:16"] })
    await expect(
      retryRenderJob(user.id, waiting.id, database)
    ).rejects.toThrowError(ONLY_FAILED_RETRY_MESSAGE)

    await database
      .update(videoRenderJobs)
      .set({ status: "running", leaseToken: "lease-1" })
      .where(eq(videoRenderJobs.id, waiting.id))
    await expect(
      retryRenderJob(user.id, waiting.id, database)
    ).rejects.toThrowError(ONLY_FAILED_RETRY_MESSAGE)

    await finish(waiting.id)
    await expect(
      retryRenderJob(user.id, waiting.id, database)
    ).rejects.toThrowError(ONLY_FAILED_RETRY_MESSAGE)
  })

  it("refuses while another export of the same project and shape is on its way", async () => {
    const project = await projectWithContent()
    const [failed] = await ask(project.id)
    await finish(failed.id, "error")
    await ask(project.id)

    await expect(
      retryRenderJob(user.id, failed.id, database)
    ).rejects.toThrowError(shapeBusyMessage("9:16"))
  })

  it("is allowed while a different shape of the same project is on its way", async () => {
    const project = await projectWithContent()
    const [failed] = await ask(project.id)
    await finish(failed.id, "error")
    await ask(project.id, { aspects: ["16:9"] })

    const retried = await retryRenderJob(user.id, failed.id, database)
    expect(retried.status).toBe("queued")
  })

  it("will not touch somebody else's export", async () => {
    const project = await projectWithContent()
    const [job] = await ask(project.id)
    await finish(job.id, "error")
    const stranger = await insertUser(database)
    await expect(
      retryRenderJob(stranger.id, job.id, database)
    ).rejects.toThrowError(RENDER_NOT_FOUND_MESSAGE)
  })
})

describe("what the editor watches", () => {
  it("has nothing to show before anything is asked for", async () => {
    const project = await projectWithContent()
    expect(await getLatestRenderJobs(user.id, project.id, database)).toEqual([])
  })

  it("shows the newest one in each shape", async () => {
    const project = await projectWithContent()
    const [firstTall] = await ask(project.id)
    await finish(firstTall.id)
    const [secondTall] = await ask(project.id)
    const wide = (await ask(project.id, { aspects: ["16:9"] })).find(
      (job) => job.aspect === "16:9"
    )

    const latest = await getLatestRenderJobs(user.id, project.id, database)
    expect(latest.map((job) => job.id)).toEqual([secondTall.id, wide?.id])
  })
})

describe("one at a time per project and shape", () => {
  it("the database refuses a second active export of the same shape outright", async () => {
    const project = await projectWithContent()
    await ask(project.id)
    // Going around the queue's own check, straight at the table: the index is
    // what makes this safe when two requests arrive at the same instant.
    await expect(
      database.execute(sql`
        insert into video_render_jobs
          (id, user_id, project_id, status, quality, aspect, created_at, updated_at)
        values ('second', ${user.id}, ${project.id}, 'queued', 'high', '9:16', now(), now())
      `)
    ).rejects.toThrow()
  })

  it("the database lets a different shape of the same project in", async () => {
    const project = await projectWithContent()
    await ask(project.id)
    await database.execute(sql`
      insert into video_render_jobs
        (id, user_id, project_id, status, quality, aspect, created_at, updated_at)
      values ('wide', ${user.id}, ${project.id}, 'queued', 'high', '16:9', now(), now())
    `)
    expect(await database.select().from(videoRenderJobs)).toHaveLength(2)
  })
})
