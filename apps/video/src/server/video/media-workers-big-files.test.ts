import { spawnSync } from "node:child_process"
import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { uuid } from "@/server/auth/security"
import { customShellMedia, customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { videoMediaFilmstrips, videoMediaProxies } from "@/server/video/schema"

/**
 * The media worker on a big video, run for real with ffmpeg: the frames wait
 * for the smooth copy and never download the original, the original is
 * downloaded once and kept, a finished copy sends a notice, and a full disk
 * makes the job wait instead of failing. The database is a test copy and
 * storage is a folder.
 */

const stand = vi.hoisted(() => ({
  db: null as unknown,
  files: new Map<string, string>(),
  downloads: [] as string[],
  uploads: [] as string[],
  diskFull: false,
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
vi.mock("@/server/video/storage-files", () => ({
  downloadToFile: async (storagePath: string, file: string) => {
    stand.downloads.push(storagePath)
    await copyFile(stand.files.get(storagePath)!, file)
  },
}))
vi.mock("@/server/media/storage", () => ({
  uploadToR2: async (storagePath: string) => {
    stand.uploads.push(storagePath)
  },
  uploadFileToR2: async (storagePath: string, filePath: string) => {
    // Kept so a later download of the stored file finds it. The worker
    // moves its own copy away afterwards, so this one is a copy.
    const kept = `${filePath}.stored`
    await copyFile(filePath, kept)
    stand.files.set(storagePath, kept)
  },
  deleteFromR2: async () => undefined,
}))
vi.mock("@/server/video/project-thumbnails", () => ({
  projectThumbnailTick: async () => undefined,
}))
vi.mock("@/server/notifications/events", () => ({
  publishNotificationCreated: async () => undefined,
}))
vi.mock("@/server/video/disk-space", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/video/disk-space")>()
  return {
    ...real,
    requireFreeDisk: async (dir: string, bytes: number) => {
      if (stand.diskFull) throw new real.DiskFullError(bytes, 0)
      await real.requireFreeDisk(dir, bytes, async () => 1024 ** 4)
    },
  }
})

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0
const GB = 1024 * 1024 * 1024

async function until<T>(read: () => Promise<T | undefined>, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs
  for (;;) {
    const value = await read()
    if (value !== undefined) return value
    if (Date.now() > end) throw new Error("The worker did not finish in time")
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

describe("the smooth copy's time limit", () => {
  it("is twice the video's length, and never under thirty minutes", async () => {
    const { proxyTimeoutMs } = await import("@/server/video/media-workers")
    expect(proxyTimeoutMs(0)).toBe(30 * 60_000)
    expect(proxyTimeoutMs(10 * 60)).toBe(30 * 60_000)
    expect(proxyTimeoutMs(60 * 60)).toBe(120 * 60_000)
  })
})

describe.skipIf(!hasFfmpeg)("the media worker on a big video", () => {
  let dir = ""
  let database: CustomShellDb
  let close: () => Promise<void>
  let userId = ""
  let workspaceId = ""
  let videoMediaTick: () => Promise<void>

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "worker-big-"))
    // This test's own kept-copies folder, made fresh, so nothing a previous
    // run kept is found.
    process.env.VIDEO_FILE_CACHE_DIR = path.join(dir, "cache")
    globalThis.__videoFileCache = undefined
    globalThis.__videoMediaWorkerState = undefined
    const testDb = await createTestDatabase()
    database = testDb.db
    close = () => testDb.client.close()
    stand.db = database
    userId = (await insertUser(database)).id
    workspaceId = (await insertWorkspace(database, { userId })).id
    ;({ videoMediaTick } = await import("@/server/video/media-workers"))
  })

  afterAll(async () => {
    // Jobs the tests don't wait for, such as a waveform and its loudness,
    // may still be writing into the kept-copies folder. Deleting it under
    // them fails with ENOTEMPTY, so the worker is let finish first.
    await until(async () => ((globalThis.__videoMediaWorkerState?.active ?? 0) === 0 ? true : undefined))
    await close?.()
    delete process.env.VIDEO_FILE_CACHE_DIR
    globalThis.__videoFileCache = undefined
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  async function insertVideo(name: string, recordedSize: number, seconds = 3) {
    const file = path.join(dir, `${uuid()}.mp4`)
    // Long ones are drawn tiny and slow, so they are quick to make.
    const picture =
      seconds > 60
        ? `testsrc=size=64x36:rate=1:duration=${seconds}`
        : `testsrc=size=320x240:rate=30:duration=${seconds}`
    const run = spawnSync("ffmpeg", [
      "-v", "error", "-f", "lavfi", "-i", picture,
      "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file,
    ])
    if (run.status !== 0) throw new Error(run.stderr.toString())
    const id = uuid()
    const storagePath = `${userId}/${id}_${name}`
    stand.files.set(storagePath, file)
    const timestamp = new Date()
    await database.insert(customShellMedia).values({
      id,
      workspaceId,
      userId,
      filename: `${id}_${name}`,
      originalName: name,
      // The row says how big the upload is; the file on disk stays small.
      fileSize: recordedSize,
      mimeType: "video/mp4",
      fileType: "video",
      storagePath,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    return { id, storagePath }
  }

  async function statusOf(table: typeof videoMediaProxies | typeof videoMediaFilmstrips, mediaId: string) {
    const [row] = await database
      .select({ status: table.status, error: table.error })
      .from(table)
      .where(eq(table.mediaId, mediaId))
    return row
  }

  it("makes frames only from the smooth copy, and downloads the original once", async () => {
    const { id, storagePath } = await insertVideo("beach.mov", 20 * GB)

    await videoMediaTick()
    await until(async () =>
      (await statusOf(videoMediaFilmstrips, id))?.status === "ready" ? true : undefined
    )

    expect((await statusOf(videoMediaProxies, id))?.status).toBe("ready")
    // The proxy job fetched the original once. The frames read the smooth
    // copy the proxy job kept, and fetched nothing.
    expect(stand.downloads.filter((path) => path === storagePath)).toHaveLength(1)
    expect(stand.downloads.filter((path) => path.startsWith("video/proxies/"))).toEqual([])
  }, 120_000)

  it("spreads a long video's frames over sheets, one frame every five seconds", async () => {
    stand.uploads = []
    const { id } = await insertVideo("talk.mov", 50 * 1024 * 1024, 11 * 60)
    await videoMediaTick()
    await until(async () =>
      (await statusOf(videoMediaFilmstrips, id))?.status === "ready" ? true : undefined
    , 180_000)
    const [strip] = await database
      .select()
      .from(videoMediaFilmstrips)
      .where(eq(videoMediaFilmstrips.mediaId, id))
    // 11 minutes is 132 frames: a full sheet of 120 and one of 12. The file
    // ffmpeg makes runs a few milliseconds over, which can be one more.
    expect(strip).toMatchObject({ columns: 10, rowsPerSheet: 12, sheetCount: 2 })
    expect(Math.abs(strip.frameCount! - 132)).toBeLessThanOrEqual(1)
    const sheets = stand.uploads.filter((path) => path.startsWith(`video/filmstrips/`) && path.includes(id))
    expect(sheets).toHaveLength(2)
    expect(sheets[0]).toBe(strip.storagePath)
  }, 240_000)

  it("tells the owner the video is ready to edit", async () => {
    const notices = await database
      .select({ message: customShellNotifications.message })
      .from(customShellNotifications)
      .where(eq(customShellNotifications.recipientUserId, userId))
    expect(notices.map((notice) => notice.message)).toContain("beach.mov is ready to edit")
  })

  it("waits for room on a full disk, keeps its tries, and says why", async () => {
    stand.diskFull = true
    globalThis.__videoMediaWorkerState = undefined
    const { id } = await insertVideo("hour.mov", 30 * GB)

    await videoMediaTick()
    const waiting = await until(async () => {
      const row = await statusOf(videoMediaProxies, id)
      return row?.status === "queued" && row.error ? row : undefined
    })
    expect(waiting.error).toContain("Waiting for room on the server's disk")
    const [{ attempts }] = await database
      .select({ attempts: videoMediaProxies.attempts })
      .from(videoMediaProxies)
      .where(eq(videoMediaProxies.mediaId, id))
    expect(attempts).toBe(0)

    // Within the minute's wait, nothing new is claimed.
    await videoMediaTick()
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect((await statusOf(videoMediaProxies, id))?.status).toBe("queued")

    // Once there is room and the minute is up, it carries on.
    stand.diskFull = false
    globalThis.__videoMediaWorkerState!.diskWaitUntil = 0
    await videoMediaTick()
    await until(async () =>
      (await statusOf(videoMediaProxies, id))?.status === "ready" ? true : undefined
    )
  }, 120_000)
})
