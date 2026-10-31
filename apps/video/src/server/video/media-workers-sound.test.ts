import { spawnSync } from "node:child_process"
import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { uuid } from "@/server/auth/security"
import { customShellMedia } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import {
  videoMediaBeats,
  videoMediaCleanSounds,
  videoMusicTracks,
} from "@/server/video/schema"

/**
 * The media worker's two sound jobs, run for real: a cleaned copy of a
 * noisy recording, and the beats of a click track marked as music. The
 * database is a test copy, ffmpeg is the one installed here, and storage is
 * a folder, so what is checked is what the worker itself does.
 */

const stand = vi.hoisted(() => ({
  db: null as unknown,
  files: new Map<string, string>(),
  uploads: new Map<string, Uint8Array>(),
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
    await copyFile(stand.files.get(storagePath)!, file)
  },
}))
vi.mock("@/server/media/storage", () => ({
  uploadToR2: async (storagePath: string, bytes: Uint8Array) => {
    stand.uploads.set(storagePath, bytes)
  },
  deleteFromR2: async () => undefined,
}))
vi.mock("@/server/video/project-thumbnails", () => ({
  projectThumbnailTick: async () => undefined,
}))

const { videoMediaTick } = await import("@/server/video/media-workers")

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0

function ffmpeg(args: string[]) {
  const result = spawnSync("ffmpeg", ["-v", "error", ...args])
  if (result.status !== 0) throw new Error(result.stderr.toString())
}

async function until<T>(read: () => Promise<T | undefined>, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs
  for (;;) {
    const value = await read()
    if (value !== undefined) return value
    if (Date.now() > end) throw new Error("The worker did not finish in time")
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

describe.skipIf(!hasFfmpeg)("the media worker's sound jobs", () => {
  let dir = ""
  let database: CustomShellDb
  let close: () => Promise<void>
  let userId = ""
  let workspaceId = ""

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "worker-sound-"))
    const testDb = await createTestDatabase()
    database = testDb.db
    close = () => testDb.client.close()
    stand.db = database
    userId = (await insertUser(database)).id
    workspaceId = (await insertWorkspace(database, { userId })).id
  })

  afterAll(async () => {
    await close?.()
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  async function insertSound(file: string) {
    const id = uuid()
    const storagePath = `${userId}/${id}.wav`
    stand.files.set(storagePath, file)
    const timestamp = new Date()
    await database.insert(customShellMedia).values({
      id,
      workspaceId,
      userId,
      filename: `${id}.wav`,
      originalName: path.basename(file),
      fileSize: 1000,
      mimeType: "audio/wav",
      fileType: "audio",
      storagePath,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    return id
  }

  it("makes a cleaned copy at the strength asked for, and only that", async () => {
    const noisy = path.join(dir, "noisy.wav")
    ffmpeg(["-f", "lavfi", "-i", "anoisesrc=c=pink:a=0.05:d=2", noisy])
    const mediaId = await insertSound(noisy)
    await database.insert(videoMediaCleanSounds).values({
      id: `${mediaId}:strong`,
      mediaId,
      strength: "strong",
      status: "queued",
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    })

    await videoMediaTick()
    const row = await until(async () => {
      const [found] = await database
        .select()
        .from(videoMediaCleanSounds)
        .where(eq(videoMediaCleanSounds.id, `${mediaId}:strong`))
      return found.status === "ready" || found.status === "error" ? found : undefined
    })
    expect(row.status).toBe("ready")
    expect(row.storagePath).toMatch(new RegExp(`^video/clean-sound/${userId}/${mediaId}/.+\\.m4a$`))
    expect(stand.uploads.get(row.storagePath!)?.byteLength).toBeGreaterThan(1000)
  }, 60_000)

  it("gives up at once on a file with no sound, rather than trying three times", async () => {
    const silent = path.join(dir, "silent.mp4")
    ffmpeg(["-f", "lavfi", "-i", "color=c=black:s=64x64:d=1", "-pix_fmt", "yuv420p", silent])
    const mediaId = await insertSound(silent)
    await database.insert(videoMediaCleanSounds).values({
      id: `${mediaId}:light`,
      mediaId,
      strength: "light",
      status: "queued",
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    })

    await videoMediaTick()
    const row = await until(async () => {
      const [found] = await database
        .select()
        .from(videoMediaCleanSounds)
        .where(eq(videoMediaCleanSounds.id, `${mediaId}:light`))
      // Back in the queue after a try, or given up on.
      return (found.status === "queued" && found.attempts > 0) || found.status === "error"
        ? found
        : undefined
    })
    expect([row.status, row.attempts, row.error]).toEqual([
      "error",
      1,
      "This file has no sound to clean",
    ])
  }, 60_000)

  it("finds the beats of a file marked as music, and of no other file", async () => {
    const clicks = path.join(dir, "clicks.wav")
    ffmpeg([
      "-f", "lavfi",
      "-i", "aevalsrc='0.8*sin(2*PI*1000*t)*exp(-60*mod(t-0.25+0.5,0.5))*gte(t,0.25)':s=44100:d=12",
      clicks,
    ])
    const music = await insertSound(clicks)
    const voice = await insertSound(clicks)
    await database.insert(videoMusicTracks).values({ mediaId: music, createdAt: new Date() })

    await videoMediaTick()
    const row = await until(async () => {
      const [found] = await database
        .select()
        .from(videoMediaBeats)
        .where(eq(videoMediaBeats.mediaId, music))
      return found?.status === "ready" ? found : undefined
    })
    expect(row.tempo).toBeCloseTo(120, 0)
    expect(row.beats?.slice(0, 3)).toEqual([
      expect.closeTo(250, -1.5),
      expect.closeTo(750, -1.5),
      expect.closeTo(1250, -1.5),
    ])
    const others = await database
      .select()
      .from(videoMediaBeats)
      .where(eq(videoMediaBeats.mediaId, voice))
    expect(others).toEqual([])
  }, 60_000)
})
