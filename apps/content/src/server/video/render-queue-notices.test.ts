import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type ProjectTimeline } from "@/lib/video/timeline-schema"
import { type CustomShellDb } from "@/server/db"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { videoRenderJobs } from "@/server/video/schema"

/**
 * The bell notice an export sends when it finishes. The worker runs for real
 * against a test database; drawing the video and storage are stand-ins, so
 * each test decides whether the render works, fails or is stopped.
 */

const stand = vi.hoisted(() => ({
  db: null as unknown,
  render: "works" as "works" | "fails" | "waits",
}))

vi.mock("@/server/db", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  return {
    ...real,
    get db() {
      return stand.db
    },
  }
})
vi.mock("@/server/media/storage", () => ({
  uploadToR2: async () => undefined,
  uploadFileToR2: async () => undefined,
  deleteFromR2: async () => undefined,
}))
vi.mock("@/server/notifications/events", () => ({
  publishNotificationCreated: async () => undefined,
}))
vi.mock("@/server/video/thumbnails", () => ({
  coverFromMainThumbnail: async () => undefined,
}))
vi.mock("@/server/video/ai-parts", () => ({
  workOutAiParts: async () => [],
}))
vi.mock("@/server/video/render", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/video/render")>()
  return {
    ...real,
    renderTimeline: async (input: { signal: AbortSignal }) => {
      if (stand.render === "fails") throw new Error("ffmpeg fell over")
      if (stand.render === "waits") {
        await new Promise((_, reject) => {
          input.signal.addEventListener("abort", () => reject(new Error("stopped")))
        })
      }
      return {
        filePath: "/nowhere/export.mp4",
        fileSize: 10,
        durationMs: 3000,
        width: 1080,
        height: 1920,
        thumbnail: null,
        dispose: async () => undefined,
      }
    },
  }
})

const queue = await import("@/server/video/render-queue")
const { writeVideoTimeline } = await import("@/server/video/project-videos")
const { createOwnedProject } = await import("@/server/video/projects")

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  stand.db = database
  stand.render = "works"
  user = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

async function askForExport() {
  const made = await createOwnedProject(user.id, "Reel", database)
  await writeVideoTimeline(
    user.id,
    made.video,
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
    1,
    database
  )
  const [job] = await queue.enqueueRenderJobs({
    userId: user.id,
    videoId: made.video,
    aspects: ["9:16"],
    quality: "high",
    frameRate: 30,
    database,
  })
  return job
}

async function statusOf(jobId: string) {
  const [row] = await database
    .select({ status: videoRenderJobs.status })
    .from(videoRenderJobs)
    .where(eq(videoRenderJobs.id, jobId))
  return row?.status
}

async function until(check: () => Promise<boolean>, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() > end) throw new Error("The worker did not finish in time")
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

function notices() {
  return database
    .select()
    .from(customShellNotifications)
    .where(eq(customShellNotifications.recipientUserId, user.id))
}

describe("the notice when an export finishes", () => {
  it("sends one notice naming the export and its shape when it is ready", async () => {
    const job = await askForExport()
    await queue.videoRenderTick()
    await until(async () => (await statusOf(job.id)) === "ready" && (await notices()).length > 0)

    const sent = await notices()
    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe("app_activity")
    expect(sent[0].message).toBe("Reel (Tall 9:16) is ready")
  })

  it("sends one notice when it fails", async () => {
    stand.render = "fails"
    const job = await askForExport()
    await queue.videoRenderTick()
    await until(async () => (await statusOf(job.id)) === "error" && (await notices()).length > 0)

    const sent = await notices()
    expect(sent).toHaveLength(1)
    expect(sent[0].message).toBe("Reel (Tall 9:16) could not be exported")
  })

  it("sends nothing when the owner stops it", async () => {
    stand.render = "waits"
    const job = await askForExport()
    await queue.videoRenderTick()
    await until(async () => (await statusOf(job.id)) === "running")

    await queue.cancelRenderJob(user.id, job.id, database)
    // The worker sees the stop within its one-second check and lets go.
    await new Promise((resolve) => setTimeout(resolve, 1_500))

    expect(await statusOf(job.id)).toBe("cancelled")
    expect(await notices()).toHaveLength(0)
  })

  it("sends one notice when a render was cut off twice by restarts", async () => {
    // The worker from the earlier tests is still live and takes the export at
    // once; it waits, then lets go when its lease is taken away below.
    stand.render = "waits"
    const job = await askForExport()
    await database
      .update(videoRenderJobs)
      .set({
        status: "running",
        attempts: 2,
        leaseToken: "gone",
        leaseExpiresAt: new Date(Date.now() - 60_000),
      })
      .where(eq(videoRenderJobs.id, job.id))

    await queue.videoRenderTick()

    expect(await statusOf(job.id)).toBe("error")
    const sent = await notices()
    expect(sent).toHaveLength(1)
    expect(sent[0].message).toBe("Reel (Tall 9:16) could not be exported")
  })
})

describe("the notice's words", () => {
  it("names the shape the way the export window does", () => {
    expect(
      queue.exportNoticeWords({ name: "Launch", aspect: "16:9", outcome: "ready" })
    ).toEqual({
      message: "Launch (Wide 16:9) is ready",
      detail: "Download or share it from the Exports page.",
    })
  })
})
