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
  saveVideo,
  saveVideoForBreakdown,
  viralVideoTick,
} from "@/server/video/viral/saved-videos"
import type { ViralBreakdown } from "@/lib/video/viral-breakdown"

/**
 * Download and AI analyse, the two buttons (polish task, part 7).
 *
 * Download keeps the file and spends no AI. AI analyse breaks a video down,
 * and on a video already downloaded it hands Gemini the stored file instead
 * of downloading it again. Nothing here touches the network or spends money:
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
const gemini = vi.hoisted(() => ({ calls: [] as { bytes: Uint8Array; mimeType: string }[] }))

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

async function readRow(id: string) {
  const [row] = await database
    .select()
    .from(videoViralVideos)
    .where(eq(videoViralVideos.id, id))
  return row
}

describe("Download", () => {
  it("keeps the file in the media library, stops at downloaded and spends no AI", async () => {
    const saved = await saveVideo(user.id, SOURCE, null, false)
    expect(saved.status).toBe("waiting")
    expect(saved.wantsAnalysis).toBe(false)

    await viralVideoTick()

    const row = await readRow(saved.id)
    expect(row.status).toBe("downloaded")
    expect(row.mediaId).not.toBeNull()
    expect(row.title).toBe("A dare that went viral")
    // yt-dlp's own channel and follower count, which a pasted video has no
    // search result to take from.
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

  it("a second tick leaves a downloaded video alone", async () => {
    const saved = await saveVideo(user.id, SOURCE, null, false)
    await viralVideoTick()
    await viralVideoTick()

    expect(download.downloadViralVideo).toHaveBeenCalledTimes(1)
    expect((await readRow(saved.id)).status).toBe("downloaded")
    expect(gemini.calls).toHaveLength(0)
  })

  it("pressed on a video already broken down changes nothing", async () => {
    const analysed = await saveVideoForBreakdown(user.id, SOURCE)
    await viralVideoTick()
    const again = await saveVideo(user.id, SOURCE, null, false)

    expect(again.id).toBe(analysed.id)
    expect(again.status).toBe("ready")
    expect(again.wantsAnalysis).toBe(true)
  })
})

describe("AI analyse", () => {
  it("on a downloaded video breaks it down without downloading it again", async () => {
    const saved = await saveVideo(user.id, SOURCE, null, false)
    await viralVideoTick()
    const mediaId = (await readRow(saved.id)).mediaId

    const pressed = await saveVideo(user.id, SOURCE, null, true)
    expect(pressed.id).toBe(saved.id)
    expect(pressed.status).toBe("waiting")
    expect(pressed.wantsAnalysis).toBe(true)

    await viralVideoTick()

    const row = await readRow(saved.id)
    expect(row.status).toBe("ready")
    expect(row.breakdown).toEqual(BREAKDOWN)
    // The same file, read back from storage, not a second download.
    expect(row.mediaId).toBe(mediaId)
    expect(download.downloadViralVideo).toHaveBeenCalledTimes(1)
    expect(gemini.calls).toHaveLength(1)
    expect([...gemini.calls[0].bytes]).toEqual([...FILE_BYTES])
    expect(gemini.calls[0].mimeType).toBe("video/mp4")
  })

  it("on a video never saved downloads it and breaks it down in one go", async () => {
    const saved = await saveVideo(user.id, SOURCE, null, true)
    await viralVideoTick()

    const row = await readRow(saved.id)
    expect(row.status).toBe("ready")
    expect(download.downloadViralVideo).toHaveBeenCalledTimes(1)
    expect(gemini.calls).toHaveLength(1)
  })

  it("pressed while a Download is still running breaks it down once the file lands", async () => {
    const saved = await saveVideo(user.id, SOURCE, null, false)
    vi.mocked(download.downloadViralVideo).mockImplementationOnce(async () => {
      // Somebody presses AI analyse mid-download.
      const pressed = await saveVideo(user.id, SOURCE, null, true)
      expect(pressed.status).toBe("downloading")
      return {
        bytes: FILE_BYTES,
        mimeType: "video/mp4",
        title: "A dare that went viral",
        channelName: "creator",
        channelId: null,
        subscribers: null,
        durationSeconds: 21,
        views: null,
        likes: null,
        comments: null,
        postedAt: null,
      }
    })

    await viralVideoTick()

    expect((await readRow(saved.id)).status).toBe("ready")
    expect(gemini.calls).toHaveLength(1)
  })

  it("turned on from a project counts the breakdown against that project", async () => {
    const at = now()
    const { videoViralProjects } = await import("@/server/video/schema")
    const projectId = uuid()
    await database.insert(videoViralProjects).values({
      id: projectId,
      ownerId: user.id,
      name: "Dares",
      createdAt: at,
      updatedAt: at,
    })
    const saved = await saveVideo(user.id, SOURCE, null, false)
    await saveVideo(user.id, SOURCE, projectId, true)

    expect((await readRow(saved.id)).viralProjectId).toBe(projectId)
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
