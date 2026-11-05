import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { videoViralVideos } from "@/server/video/schema"
import * as download from "@/server/video/viral/download"
import {
  retrySavedVideo,
  viralVideoTick,
} from "@/server/video/viral/saved-videos"
import type { ViralBreakdown } from "@/lib/video/viral-breakdown"

/**
 * The worker behind the editor's Copy panel. A row that wants no analysis
 * keeps the file and spends no AI. Otherwise Gemini breaks it down, and Try
 * again after a failed breakdown hands Gemini the stored file instead of
 * downloading it again. Nothing here touches the network or spends money:
 * yt-dlp, the bucket, ffmpeg and Gemini are all stood in for.
 */

const FILE_BYTES = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])

const BREAKDOWN: ViralBreakdown = {
  transcript: [{ startMs: 0, endMs: 1_000, text: "Watch this" }],
  segments: [{ role: "hook", startMs: 0, endMs: 1_000, summary: "Opens on a dare" }],
  scenes: [{ startMs: 0, endMs: 1_000 }],
}

const stored = vi.hoisted(() => new Map<string, Uint8Array>())
const workspace = vi.hoisted(() => ({ id: "" }))
const gemini = vi.hoisted(() => ({
  calls: [] as { bytes: Uint8Array; mimeType: string }[],
  failNext: false,
}))

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  uploadToR2: async (path: string, bytes: Uint8Array) => {
    stored.set(path, bytes)
  },
  deleteFromR2: async (path: string) => {
    stored.delete(path)
  },
  getFromR2: async (path: string) => ({
    Body: { transformToByteArray: async () => stored.get(path) ?? new Uint8Array() },
  }),
  getPublicMediaUrl: async (path: string) => `https://media.test/${path}`,
}))

// A library row is written the way a real download lands, without the shell's
// file checks, which want a real video.
vi.mock("@/server/video/asset-factories/media", async () => {
  // Read at call time: each test swaps in its own database.
  const dbModule = await import("@/server/db")
  const { customShellMedia: media } = await import("@/server/schema")
  const { eq: equals } = await import("drizzle-orm")
  return {
    saveGeneratedAsset: async (options: { userId: string; bytes: Uint8Array; mimeType: string }) => {
      const id = crypto.randomUUID()
      const storagePath = `${options.userId}/${id}.mp4`
      stored.set(storagePath, options.bytes)
      const at = new Date()
      const [row] = await dbModule.db
        .insert(media)
        .values({
          id,
          workspaceId: workspace.id,
          userId: options.userId,
          filename: `${id}.mp4`,
          originalName: "Saved video.mp4",
          fileSize: options.bytes.byteLength,
          mimeType: options.mimeType,
          fileType: "video",
          storagePath,
          createdAt: at,
          updatedAt: at,
        })
        .returning()
      return row
    },
    discardGeneratedAsset: async (asset: { id: string; storagePath: string }) => {
      await dbModule.db.delete(media).where(equals(media.id, asset.id))
      stored.delete(asset.storagePath)
    },
  }
})

vi.mock("@/server/video/ffmpeg", () => ({
  // No cover is taken; a video with no cover is still worth breaking down.
  runFfmpeg: async () => {
    throw new Error("no ffmpeg in tests")
  },
}))

vi.mock("@/server/video/viral/analysis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/video/viral/analysis")>()),
  breakDownVideo: async (options: { bytes: Uint8Array; mimeType: string }) => {
    gemini.calls.push({ bytes: options.bytes, mimeType: options.mimeType })
    if (gemini.failNext) {
      gemini.failNext = false
      throw new Error("Gemini could not be reached. Try again in a moment.")
    }
    return BREAKDOWN
  },
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

const SOURCE = "https://www.tiktok.com/@creator/video/7312345678901234567"

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspace.id = (await insertWorkspace(database, { userId: user.id })).id
  stored.clear()
  gemini.calls.length = 0
  gemini.failNext = false
  vi.spyOn(download, "downloadViralVideo").mockResolvedValue({
    bytes: FILE_BYTES,
    mimeType: "video/mp4",
    title: "A dare that went viral",
    channelName: "creator",
    channelId: "@creator",
    subscribers: 50_000,
    durationSeconds: 21,
    views: 1_200_000,
    likes: 80_000,
    comments: 900,
    postedAt: new Date("2026-10-01T00:00:00Z"),
  })
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(async () => {
  await client.close()
  vi.restoreAllMocks()
})

/** A row waiting for the worker, as Make this a template used to leave one. */
async function insertWaiting(wantsAnalysis: boolean) {
  const at = now()
  const id = uuid()
  await database.insert(videoViralVideos).values({
    id,
    ownerId: user.id,
    platform: "tiktok",
    platformVideoId: "7312345678901234567",
    sourceUrl: SOURCE,
    status: "waiting",
    wantsAnalysis,
    createdAt: at,
    updatedAt: at,
  })
  return id
}

async function readRow(id: string) {
  const [row] = await database
    .select()
    .from(videoViralVideos)
    .where(eq(videoViralVideos.id, id))
  return row
}

describe("a row that wants no analysis", () => {
  it("keeps the file in the media library, stops at downloaded and spends no AI", async () => {
    const id = await insertWaiting(false)

    await viralVideoTick()

    const row = await readRow(id)
    expect(row.status).toBe("downloaded")
    expect(row.mediaId).not.toBeNull()
    expect(row.title).toBe("A dare that went viral")
    // yt-dlp's own channel and follower count.
    expect(row.channelId).toBe("@creator")
    expect(row.subscribers).toBe(50_000)
    expect(row.breakdown).toBeNull()
    // Let go of, so nothing thinks a worker is still on it.
    expect(row.leaseToken).toBeNull()
    expect(row.leaseExpiresAt).toBeNull()
    expect(gemini.calls).toHaveLength(0)

    const [media] = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, row.mediaId as string))
    expect(media.fileType).toBe("video")
  })

  it("is left alone by a second tick", async () => {
    const id = await insertWaiting(false)
    await viralVideoTick()
    await viralVideoTick()

    expect(download.downloadViralVideo).toHaveBeenCalledTimes(1)
    expect((await readRow(id)).status).toBe("downloaded")
    expect(gemini.calls).toHaveLength(0)
  })
})

describe("a row that wants the AI", () => {
  it("downloads and breaks down in one go", async () => {
    const id = await insertWaiting(true)
    await viralVideoTick()

    const row = await readRow(id)
    expect(row.status).toBe("ready")
    expect(row.breakdown).toEqual(BREAKDOWN)
    expect(download.downloadViralVideo).toHaveBeenCalledTimes(1)
    expect(gemini.calls).toHaveLength(1)
  })

  it("tried again after a failed breakdown reads the stored file instead of downloading again", async () => {
    const id = await insertWaiting(true)
    gemini.failNext = true
    await viralVideoTick()

    const failed = await readRow(id)
    expect(failed.status).toBe("failed")
    expect(failed.error).toMatch(/Gemini could not be reached/)
    expect(failed.mediaId).not.toBeNull()

    await retrySavedVideo(user.id, id)
    await viralVideoTick()

    const row = await readRow(id)
    expect(row.status).toBe("ready")
    expect(row.breakdown).toEqual(BREAKDOWN)
    // The same file, read back from storage, not a second download.
    expect(row.mediaId).toBe(failed.mediaId)
    expect(download.downloadViralVideo).toHaveBeenCalledTimes(1)
    expect(gemini.calls).toHaveLength(2)
    expect([...gemini.calls[1].bytes]).toEqual([...FILE_BYTES])
    expect(gemini.calls[1].mimeType).toBe("video/mp4")
  })
})

describe("the status check", () => {
  it("allows downloaded and every status a row could already hold", async () => {
    const at = now()
    for (const status of ["waiting", "downloading", "downloaded", "analysing", "ready", "failed"]) {
      await database.insert(videoViralVideos).values({
        id: uuid(),
        ownerId: user.id,
        platform: "tiktok",
        platformVideoId: status,
        sourceUrl: SOURCE,
        status,
        createdAt: at,
        updatedAt: at,
      })
    }
    expect(await database.select().from(videoViralVideos)).toHaveLength(6)
  })

  it("starts every row as wanting the AI, as every row saved before did", async () => {
    const at = now()
    const id = uuid()
    await database.insert(videoViralVideos).values({
      id,
      ownerId: user.id,
      platform: "tiktok",
      platformVideoId: "old",
      sourceUrl: SOURCE,
      status: "ready",
      createdAt: at,
      updatedAt: at,
    })
    expect((await readRow(id)).wantsAnalysis).toBe(true)
  })
})
