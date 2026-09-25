import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { asc, eq } from "drizzle-orm"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  createGeneration,
  insertGeneration,
  retryGeneration,
  videoGenerationTick,
} from "@/server/video/asset-factories/generations"
import { createOwnedProject } from "@/server/video/projects"
import {
  videoActors,
  videoAiGenerations,
  videoFirstFrames,
  videoProjects,
} from "@/server/video/schema"

const uploaded = new Map<string, string>()
vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  uploadToR2: async (storagePath: string, _bytes: Uint8Array, mimeType: string) => {
    uploaded.set(storagePath, mimeType)
  },
  deleteFromR2: async (storagePath: string) => {
    uploaded.delete(storagePath)
  },
  getPublicMediaUrl: async (storagePath: string) => `https://media.test/${storagePath}`,
}))

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0
// A real one second clip, so the last frame is taken the way Veo's are.
let pieceVideo = new Uint8Array()
beforeAll(() => {
  if (!hasFfmpeg) return
  const dir = mkdtempSync(path.join(tmpdir(), "shot-test-"))
  const file = path.join(dir, "piece.mp4")
  spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=duration=1:size=64x64:rate=24", "-pix_fmt", "yuv420p", file])
  pieceVideo = new Uint8Array(readFileSync(file))
  rmSync(dir, { recursive: true, force: true })
})

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string
const originalGeminiKey = process.env.CUSTOM_SHELL_GEMINI_API_KEY

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
  process.env.CUSTOM_SHELL_GEMINI_API_KEY = "test-key"
  uploaded.clear()
})

afterEach(async () => {
  await client.close()
  vi.unstubAllGlobals()
  if (originalGeminiKey === undefined) {
    delete process.env.CUSTOM_SHELL_GEMINI_API_KEY
  } else {
    process.env.CUSTOM_SHELL_GEMINI_API_KEY = originalGeminiKey
  }
})

async function seedFirstFrame() {
  const timestamp = now()
  const project = await createOwnedProject(user.id, "Lease test", database)
  await database.insert(customShellMedia).values({
    id: "media-1",
    workspaceId,
    userId: user.id,
    filename: "frame.png",
    originalName: "frame.png",
    altText: "Frame",
    fileSize: 8,
    mimeType: "image/png",
    fileType: "image",
    storagePath: `${user.id}/frame.png`,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await database.insert(videoActors).values({
    id: "actor-1",
    userId: user.id,
    name: "Actor",
    prompt: "Actor",
    model: "gemini-2.5-flash-image",
    status: "active",
    tags: [],
    imageMediaId: "media-1",
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  await database.insert(videoFirstFrames).values({
    id: "frame-1",
    userId: user.id,
    actorId: "actor-1",
    name: "Frame",
    prompt: "Frame",
    model: "gemini-2.5-flash-image",
    aspectRatio: "9:16",
    tags: [],
    pinned: false,
    imageMediaId: "media-1",
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return project
}

async function seedProcessingGeneration() {
  const timestamp = now()
  const project = await seedFirstFrame()
  await database.insert(videoAiGenerations).values({
    id: "generation-1",
    userId: user.id,
    projectId: project.id,
    firstFrameId: "frame-1",
    firstFrameMediaId: "media-1",
    prompt: "Move",
    model: "veo-3.1-generate-preview",
    aspectRatio: "9:16",
    durationSeconds: 4,
    shotId: "generation-1",
    shotIndex: 1,
    shotPieces: 1,
    status: "processing",
    operationName: "operations/test",
    attempts: 1,
    startedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

describe("durable video generation leases", () => {
  it("lets only one overlapping worker poll a processing job", async () => {
    await seedProcessingGeneration()
    const provider = vi.fn(async () =>
      new Response(JSON.stringify({ done: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", provider)

    await Promise.all([videoGenerationTick(), videoGenerationTick()])

    expect(provider).toHaveBeenCalledTimes(1)
    const [row] = await database
      .select()
      .from(videoAiGenerations)
      .where(eq(videoAiGenerations.id, "generation-1"))
    expect(row.status).toBe("processing")
    expect(row.leaseToken).toBeNull()
    expect(row.leaseExpiresAt).toBeNull()
  })
})

/** A two piece shot whose first piece Google has just finished. */
async function seedTwoPieceShot() {
  const timestamp = now()
  const project = await seedFirstFrame()
  const piece = {
    userId: user.id,
    projectId: project.id,
    firstFrameId: "frame-1",
    model: "veo-3.1-generate-preview",
    aspectRatio: "9:16",
    durationSeconds: 8,
    shotId: "piece-1",
    shotPieces: 2,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await database.insert(videoAiGenerations).values([
    {
      ...piece,
      id: "piece-1",
      shotIndex: 1,
      firstFrameMediaId: "media-1",
      prompt: "Walks in",
      status: "processing",
      operationName: "operations/piece-1",
      attempts: 1,
      startedAt: timestamp,
    },
    { ...piece, id: "piece-2", shotIndex: 2, prompt: "Sits down", status: "waiting" },
  ])
  return project
}

function googleFinishes(video: Uint8Array) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) =>
      String(input).includes("operations/")
        ? Response.json({
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [
                  { video: { uri: "https://generativelanguage.googleapis.com/v1beta/files/v:download" } },
                ],
              },
            },
          })
        : new Response(Buffer.from(video), { headers: { "Content-Type": "video/mp4" } })
    )
  )
}

async function pieces() {
  return database
    .select()
    .from(videoAiGenerations)
    .orderBy(asc(videoAiGenerations.shotIndex))
}

describe("shots longer than one clip", () => {
  it("writes every piece at once, with only the first one queued", async () => {
    const project = await seedFirstFrame()
    const shot = await createGeneration(user.id, {
      projectId: project.id,
      firstFrameId: "frame-1",
      prompts: ["One", "Two", "Three"],
      lengthSeconds: 24,
    })

    expect(shot.duration_seconds).toBe(24)
    expect(shot.status).toBe("queued")
    const rows = await pieces()
    expect(rows.map((row) => [row.shotIndex, row.status, row.durationSeconds, row.prompt])).toEqual([
      [1, "queued", 8, "One"],
      [2, "waiting", 8, "Two"],
      [3, "waiting", 8, "Three"],
    ])
    expect(rows.every((row) => row.shotId === shot.id && row.shotPieces === 3)).toBe(true)
    expect(rows.map((row) => row.firstFrameMediaId)).toEqual(["media-1", null, null])
  })

  it("refuses a shot whose directions do not match its pieces", async () => {
    const project = await seedFirstFrame()
    await expect(
      createGeneration(user.id, {
        projectId: project.id,
        firstFrameId: "frame-1",
        prompts: ["Only one"],
        lengthSeconds: 16,
      })
    ).rejects.toThrow("Write one direction for each piece of the shot")
  })

  it.skipIf(!hasFfmpeg)("queues the next piece from the last frame of the one before", async () => {
    await seedTwoPieceShot()
    googleFinishes(pieceVideo)

    await videoGenerationTick()

    const [first, second] = await pieces()
    expect(first.status).toBe("ready")
    expect(second.status).toBe("queued")
    const [frame] = await database
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, second.firstFrameMediaId ?? ""))
    expect(frame.mimeType).toBe("image/png")
    expect(uploaded.get(frame.storagePath)).toBe("image/png")
  })

  it("fails the piece and keeps the next one waiting when no frame can be read", async () => {
    await seedTwoPieceShot()
    googleFinishes(new TextEncoder().encode("not a video"))

    await videoGenerationTick()

    const [first, second] = await pieces()
    expect(first.status).toBe("error")
    expect(second.status).toBe("waiting")
    expect(second.firstFrameMediaId).toBeNull()
    expect(uploaded.size).toBe(0)
  })

  it("lays a finished shot down as clips with no gap between them", async () => {
    const project = await seedTwoPieceShot()
    const timestamp = now()
    for (const id of ["out-1", "out-2"]) {
      await database.insert(customShellMedia).values({
        id,
        workspaceId,
        userId: user.id,
        filename: `${id}.mp4`,
        originalName: "AI video.mp4",
        fileSize: 8,
        mimeType: "video/mp4",
        fileType: "video",
        storagePath: `${user.id}/${id}.mp4`,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
    await database
      .update(videoAiGenerations)
      .set({ status: "ready", outputMediaId: "out-1", finishedAt: timestamp })
      .where(eq(videoAiGenerations.id, "piece-1"))
    await database
      .update(videoAiGenerations)
      .set({ status: "ready", outputMediaId: "out-2", finishedAt: timestamp })
      .where(eq(videoAiGenerations.id, "piece-2"))

    await insertGeneration(user.id, "piece-1", project.id)

    const [saved] = await database
      .select()
      .from(videoProjects)
      .where(eq(videoProjects.id, project.id))
    const track = (saved.timeline as { tracks: Array<{ clips: Array<{ mediaId: string; startMs: number; durationMs: number }> }> }).tracks.at(-1)
    expect(track?.clips.map((clip) => [clip.mediaId, clip.startMs, clip.durationMs])).toEqual([
      ["out-1", 0, 8000],
      ["out-2", 8000, 8000],
    ])
  })

  it("refuses a Retry while another video runs on the project", async () => {
    const project = await seedTwoPieceShot()
    const timestamp = now()
    await database
      .update(videoAiGenerations)
      .set({ status: "ready", outputMediaId: "media-1", operationName: null })
      .where(eq(videoAiGenerations.id, "piece-1"))
    await database
      .update(videoAiGenerations)
      .set({ status: "error", errorMessage: "Google could not generate the video." })
      .where(eq(videoAiGenerations.id, "piece-2"))
    await database.insert(videoAiGenerations).values({
      id: "other",
      userId: user.id,
      projectId: project.id,
      firstFrameId: "frame-1",
      firstFrameMediaId: "media-1",
      prompt: "Another",
      model: "veo-3.1-generate-preview",
      aspectRatio: "9:16",
      durationSeconds: 4,
      shotId: "other",
      shotIndex: 1,
      shotPieces: 1,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await expect(retryGeneration(user.id, "piece-1")).rejects.toThrow(
      "This project already has a video generating"
    )
    const [second] = await database
      .select()
      .from(videoAiGenerations)
      .where(eq(videoAiGenerations.id, "piece-2"))
    expect(second.status).toBe("error")
  })

  it("will not lay down a shot that is still being made", async () => {
    const project = await seedTwoPieceShot()
    await expect(insertGeneration(user.id, "piece-1", project.id)).rejects.toThrow(
      "Only ready generations can be inserted"
    )
  })
})
