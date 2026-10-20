import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { asc, eq } from "drizzle-orm"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  FREE_KEY_MESSAGE,
  PERSON_SHOTS_FULL_MESSAGE,
  PROJECT_SHOTS_FULL_MESSAGE,
  VIDEO_MODEL,
  type ShotLengthSeconds,
  type VideoQuality,
} from "@/lib/video/asset-factories"
import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import {
  customShellAiAllowanceOverrides,
  customShellAiUsageEvents,
  customShellMedia,
  type CustomShellUser,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  createGeneration,
  listGenerations,
  omniRequestBody,
  retryGeneration,
  videoGenerationTick,
  videoPrompt,
} from "@/server/video/asset-factories/generations"
import { createOwnedProject } from "@/server/video/projects"
import {
  videoActors,
  videoAiGenerations,
  videoExtras,
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
  getFromR2: async () => ({
    Body: { transformToByteArray: async () => new Uint8Array([137, 80, 78, 71]) },
  }),
}))

// The pictures in these tests are not real images, so the board and the
// shrinking are stood in for: each picture read is its own bytes, a board is
// one marker, and shrinking hands the bytes back. person-board.test.ts runs
// the real ones.
vi.mock("@/server/video/asset-factories/person-board", () => ({
  readStoredPicture: async (storagePath: string) => new TextEncoder().encode(storagePath),
  buildPersonBoard: async (tiles: { id: string }[]) => ({
    bytes: new TextEncoder().encode(`board:${tiles.map((tile) => tile.id).join(",")}`),
    mimeType: "image/jpeg",
    tileMediaIds: tiles.map((tile) => tile.id),
  }),
  shrinkReference: async (bytes: Uint8Array) => ({ bytes, mimeType: "image/jpeg" }),
}))

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0
// A real one second clip, so the last frame is taken the way a piece's is.
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
    projectId: project.id,
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
    model: VIDEO_MODEL,
    aspectRatio: "9:16",
    durationSeconds: 4,
    shotId: "generation-1",
    shotIndex: 1,
    shotPieces: 1,
    status: "processing",
    operationName: "run-test",
    attempts: 1,
    startedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

describe("durable video generation leases", () => {
  it("lets only one overlapping worker poll a processing job", async () => {
    await seedProcessingGeneration()
    const provider = vi.fn(async () => Response.json({ status: "in_progress" }))
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
    model: VIDEO_MODEL,
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
      operationName: "run-piece-1",
      attempts: 1,
      startedAt: timestamp,
    },
    { ...piece, id: "piece-2", shotIndex: 2, prompt: "Sits down", status: "waiting" },
  ])
  return project
}

/** The start of an MP4 file, which is all the upload check reads. */
const MP4_START = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom\0\0\0\0isommp42")])

/**
 * Google's answer for a finished piece: the clip inline as base64, and what
 * it counted. 46,336 tokens is 8 seconds at 720p.
 */
function finishedAnswer(video: Uint8Array, usage: object | null = {
  total_input_tokens: 2000,
  total_output_tokens: 46336,
  total_thought_tokens: 0,
}) {
  return Response.json({
    id: "run",
    status: "completed",
    steps: [
      { type: "user_input", content: [{ type: "text", text: "..." }] },
      {
        type: "model_output",
        content: [{ type: "video", mime_type: "video/mp4", data: Buffer.from(video).toString("base64") }],
      },
    ],
    ...(usage ? { usage } : {}),
  })
}

function googleFinishes(video: Uint8Array, usage?: object | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => finishedAnswer(video, usage))
  )
}

async function pieces() {
  return database
    .select()
    .from(videoAiGenerations)
    .orderBy(asc(videoAiGenerations.shotIndex))
}

/** Shots already being made, written straight in, one 4 second piece each. */
async function insertRunningShots(projectId: string, count: number, prefix = "running") {
  const timestamp = now()
  await database.insert(videoAiGenerations).values(
    Array.from({ length: count }, (_, index) => ({
      id: `${prefix}-${index}`,
      userId: user.id,
      projectId,
      firstFrameId: "frame-1",
      firstFrameMediaId: "media-1",
      prompt: `Running ${index}`,
      model: VIDEO_MODEL,
      aspectRatio: "9:16",
      durationSeconds: 4,
      shotId: `${prefix}-${index}`,
      shotIndex: 1,
      shotPieces: 1,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
  )
}

function makeShot(
  projectId: string,
  prompt: string,
  options: { lengthSeconds?: ShotLengthSeconds; quality?: VideoQuality; firstFrameId?: string } = {}
) {
  const lengthSeconds = options.lengthSeconds ?? 8
  return createGeneration(user.id, {
    projectId,
    firstFrameId: options.firstFrameId ?? "frame-1",
    prompts: lengthSeconds > 8 ? Array.from({ length: lengthSeconds / 8 }, () => prompt) : [prompt],
    lengthSeconds,
    quality: options.quality ?? "720p",
  })
}

describe("several shots at once", () => {
  it("makes three shots in one project at once and refuses a fourth", async () => {
    const project = await seedFirstFrame()
    for (const prompt of ["She waves", "She laughs", "She turns away"]) {
      await makeShot(project.id, prompt)
    }

    await expect(makeShot(project.id, "She sits")).rejects.toThrow(
      PROJECT_SHOTS_FULL_MESSAGE
    )
    const { generations } = await listGenerations(user.id, project.id)
    expect(generations.map((shot) => [shot.pieces[0].prompt, shot.status])).toEqual(
      expect.arrayContaining([
        ["She waves", "queued"],
        ["She laughs", "queued"],
        ["She turns away", "queued"],
      ])
    )
    expect(generations).toHaveLength(3)
  })

  it("has the database refuse a fourth that skipped the app's check", async () => {
    const project = await seedFirstFrame()
    await insertRunningShots(project.id, 3)
    await expect(insertRunningShots(project.id, 1, "extra")).rejects.toThrow()
    const rows = await pieces()
    expect(rows).toHaveLength(3)
  })

  it("refuses a seventh shot across one person's projects", async () => {
    await seedFirstFrame()
    const second = await createOwnedProject(user.id, "Second", database)
    const third = await createOwnedProject(user.id, "Third", database)
    const fourth = await createOwnedProject(user.id, "Fourth", database)
    await insertRunningShots(second.id, 3, "second")
    await insertRunningShots(third.id, 3, "third")

    await expect(insertRunningShots(fourth.id, 1, "fourth")).rejects.toThrow()
    await database.insert(videoFirstFrames).values({
      id: "frame-4",
      userId: user.id,
      projectId: fourth.id,
      actorId: "actor-1",
      name: "Frame",
      prompt: "Frame",
      model: "gemini-2.5-flash-image",
      aspectRatio: "9:16",
      tags: [],
      pinned: false,
      imageMediaId: "media-1",
      createdAt: now(),
      updatedAt: now(),
    })
    await expect(
      makeShot(fourth.id, "Move", { firstFrameId: "frame-4" })
    ).rejects.toThrow(PERSON_SHOTS_FULL_MESSAGE)
  })

  it("counts shots being made against the monthly allowance and names the shortfall", async () => {
    const project = await seedFirstFrame()
    await database.insert(customShellAiAllowanceOverrides).values({
      userId: user.id,
      monthlyCents: 200,
      createdAt: now(),
      updatedAt: now(),
    })
    // Two 8 second shots are 2 x $0.81 = $1.62 of the $2.00, and neither is
    // on the meter yet because Google charges when a shot arrives.
    await makeShot(project.id, "One")
    await makeShot(project.id, "Two")

    await expect(makeShot(project.id, "Three")).rejects.toThrow(
      "Your monthly AI allowance has $2.00 left. Shots still being made will take $1.62 of it, and this one costs $0.81, so it is $0.43 short."
    )
    expect(await pieces()).toHaveLength(2)
  })

  it("counts shots being made against the project's spend limit", async () => {
    const project = await seedFirstFrame()
    await database
      .update(videoProjects)
      .set({ spendLimitCents: 100 })
      .where(eq(videoProjects.id, project.id))
    await makeShot(project.id, "One")

    await expect(makeShot(project.id, "Two")).rejects.toThrow(
      "This project has spent $0.00 of its $1.00 limit, shots still being made will add $0.81, and this costs about $0.81, so the limit is $0.62 short. Raise the limit in the project's settings."
    )
  })

  it("starts each shot a pass apart and asks after every running one on each pass", async () => {
    const project = await seedFirstFrame()
    for (const prompt of ["One", "Two", "Three"]) await makeShot(project.id, prompt)
    let started = 0
    const checked: string[] = []
    // Google finishes the last shot asked for first.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input)
        if (url.endsWith("/v1beta/interactions")) {
          started += 1
          return Response.json({ id: `run-${started}`, status: "in_progress" })
        }
        const id = url.slice(url.lastIndexOf("/") + 1)
        checked.push(id)
        return id === "run-3"
          ? finishedAnswer(MP4_START)
          : Response.json({ id, status: "in_progress" })
      })
    )

    await videoGenerationTick()
    await videoGenerationTick()
    await videoGenerationTick()
    expect(started).toBe(3)
    // Pass 2 checked shot 1; pass 3 checked shots 1 and 2.
    expect(checked.sort()).toEqual(["run-1", "run-1", "run-2"])

    checked.length = 0
    await videoGenerationTick()
    expect(checked.sort()).toEqual(["run-1", "run-2", "run-3"])
    const rows = await database
      .select()
      .from(videoAiGenerations)
      .orderBy(asc(videoAiGenerations.createdAt))
    const byPrompt = Object.fromEntries(rows.map((row) => [row.prompt, row.status]))
    expect(byPrompt).toEqual({ One: "processing", Two: "processing", Three: "ready" })
  })

  it("puts a piece back in the queue when Google is too busy to start it", async () => {
    const project = await seedFirstFrame()
    await makeShot(project.id, "One")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { message: "Resource exhausted" } }, { status: 429 })
      )
    )

    await videoGenerationTick()

    const [row] = await pieces()
    expect(row.status).toBe("queued")
    expect(row.errorMessage).toBeNull()
    expect(row.leaseToken).toBeNull()
  })

  it("fails at once, saying why, when the key is a free key", async () => {
    const project = await seedFirstFrame()
    await makeShot(project.id, "One")
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(FREE_TIER_ANSWER, { status: 429 })))

    await videoGenerationTick()

    const [row] = await pieces()
    expect(row.status).toBe("error")
    expect(row.errorMessage).toBe(FREE_KEY_MESSAGE)
  })
})

const FREE_TIER_ANSWER = {
  error: {
    message:
      "Rate limit exceeded for model gemini-omni-1.1-flash (limit: 0 input tokens per minute on Free Tier). Please upgrade your tier at https://ai.dev/rate-limit.",
    code: "too_many_requests",
  },
}

describe("shots longer than one clip", () => {
  it("writes every piece at once, with only the first one queued", async () => {
    const project = await seedFirstFrame()
    const shot = await createGeneration(user.id, {
      projectId: project.id,
      firstFrameId: "frame-1",
      prompts: ["One", "Two", "Three"],
      lengthSeconds: 24,
      quality: "720p",
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
        quality: "720p",
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

  it("lists a finished shot's pieces as files to drag, in the order they play", async () => {
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
    for (const [piece, output] of [["piece-1", "out-1"], ["piece-2", "out-2"]]) {
      await database
        .update(videoAiGenerations)
        .set({ status: "ready", outputMediaId: output, finishedAt: timestamp })
        .where(eq(videoAiGenerations.id, piece))
    }

    const { generations } = await listGenerations(user.id, project.id)

    expect(generations).toHaveLength(1)
    expect(generations[0].status).toBe("ready")
    expect(generations[0].first_frame_id).toBe("frame-1")
    expect(generations[0].pieces.map((piece) => piece.output?.id)).toEqual(["out-1", "out-2"])
  })

  it("lists nothing from another project", async () => {
    await seedTwoPieceShot()
    const other = await createOwnedProject(user.id, "Other", database)
    expect((await listGenerations(user.id, other.id)).generations).toEqual([])
  })

  it("refuses a Retry while the project is already making its most shots", async () => {
    const project = await seedTwoPieceShot()
    await database
      .update(videoAiGenerations)
      .set({ status: "ready", outputMediaId: "media-1", operationName: null })
      .where(eq(videoAiGenerations.id, "piece-1"))
    await database
      .update(videoAiGenerations)
      .set({ status: "error", errorMessage: "Google could not generate the video." })
      .where(eq(videoAiGenerations.id, "piece-2"))
    await insertRunningShots(project.id, 3)

    await expect(retryGeneration(user.id, "piece-1")).rejects.toThrow(
      PROJECT_SHOTS_FULL_MESSAGE
    )
    const [second] = await database
      .select()
      .from(videoAiGenerations)
      .where(eq(videoAiGenerations.id, "piece-2"))
    expect(second.status).toBe("error")
  })

  it("will not make a clip in one project from another project's first frame", async () => {
    await seedFirstFrame()
    const other = await createOwnedProject(user.id, "Other", database)
    await expect(makeShot(other.id, "Move")).rejects.toThrow("First frame not found")
  })
})

describe("the project's spend limit", () => {
  it("stops a shot that would take the project past its limit, before anything is made", async () => {
    const project = await seedFirstFrame()
    // An 8 second shot is 8 x 5,792 tokens at $17.50 a million = $0.81,
    // and $0.70 is the limit.
    await database
      .update(videoProjects)
      .set({ spendLimitCents: 70 })
      .where(eq(videoProjects.id, project.id))

    await expect(makeShot(project.id, "Move")).rejects.toThrow(
      "This project has spent $0.00 of its $0.70 limit, and this costs about $0.81, so the limit is $0.11 short. Raise the limit in the project's settings."
    )
    expect(await pieces()).toEqual([])
  })

  it("lets the shot through when it fits under the limit", async () => {
    const project = await seedFirstFrame()
    await database
      .update(videoProjects)
      .set({ spendLimitCents: 100 })
      .where(eq(videoProjects.id, project.id))
    const shot = await makeShot(project.id, "Move")
    expect(shot.status).toBe("queued")
  })
})

const FRAME_DATA = Buffer.from(new Uint8Array([137, 80, 78, 71])).toString("base64")

describe("the prompt Omni Flash is sent", () => {
  it("names the first frame, then puts the style line first, then the direction", () => {
    const prompt = videoPrompt("Flat illustration, warm palette", "Waves crash")
    expect(prompt.split("\n\n")).toEqual([
      "[# Sources <FIRST_FRAME>@Image1]",
      "Style: Flat illustration, warm palette",
      "Waves crash",
      "Use Image1 as the exact first frame. Do not add captions or on-screen text.",
    ])
  })

  it("leaves the style line out when the project has none", () => {
    expect(videoPrompt(null, "Waves crash")).toBe(
      "[# Sources <FIRST_FRAME>@Image1]\n\nWaves crash\n\nUse Image1 as the exact first frame. Do not add captions or on-screen text."
    )
  })

  it("reads the style off the project when the clip starts", async () => {
    const project = await seedFirstFrame()
    await database
      .update(videoProjects)
      .set({ style: "Flat illustration, warm palette" })
      .where(eq(videoProjects.id, project.id))
    await makeShot(project.id, "Waves crash")
    const sent = captureRequests()

    await videoGenerationTick()

    expect(sent).toHaveLength(1)
    const body = JSON.parse(sent[0]) as OmniBody
    expect(body.input.at(-1)?.text).toBe(
      videoPrompt("Flat illustration, warm palette", "Waves crash", {
        lines: ["The person is: Actor."],
        references: { board: false, backdrop: false },
      })
    )
    const [row] = await pieces()
    expect(row.operationName).toBe("run-started")
  })
})

describe("the request body", () => {
  const base = {
    prompt: "Waves crash",
    firstFrame: { mimeType: "image/png", data: "AAAA" },
    references: [],
    aspectRatio: "9:16" as const,
    seconds: 8,
  }

  it("asks for 1080p only when Sharp is picked", () => {
    expect(omniRequestBody({ ...base, quality: "1080p" }).response_format.resolution).toBe("1080p")
    expect(omniRequestBody({ ...base, quality: "720p" }).response_format.resolution).toBe("720p")
    expect(omniRequestBody({ ...base, quality: "360p" }).response_format.resolution).toBe("360p")
  })

  it("asks for the vertical shape itself rather than a cropped landscape one", () => {
    expect(omniRequestBody({ ...base, quality: "720p" })).toEqual({
      model: "gemini-omni-1.1-flash",
      input: [
        { type: "image", data: "AAAA", mime_type: "image/png" },
        { type: "text", text: "Waves crash" },
      ],
      response_format: { type: "video", aspect_ratio: "9:16", resolution: "720p", duration: "8s" },
      background: true,
    })
  })

  it("puts the reference pictures between the first frame and the words", () => {
    const body = omniRequestBody({
      ...base,
      quality: "720p",
      references: [
        { mimeType: "image/jpeg", data: "BOARD" },
        { mimeType: "image/jpeg", data: "PLACE" },
      ],
    })
    expect(body.input.map((part) => ("data" in part ? part.data : part.type))).toEqual([
      "AAAA",
      "BOARD",
      "PLACE",
      "text",
    ])
  })
})

/** Records every request body, and answers each start with a running job. */
function captureRequests() {
  const sent: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: string | URL, init?: RequestInit) => {
      sent.push(String(init?.body))
      return Response.json({ id: "run-started", status: "in_progress" })
    })
  )
  return sent
}

type OmniBody = {
  input: { type: string; data?: string; mime_type?: string; text?: string }[]
  response_format: Record<string, string>
}

describe("the picture size", () => {
  it("makes the shot at the size picked, and the next shot starts on it", async () => {
    const project = await seedFirstFrame()
    expect((await listGenerations(user.id, project.id)).quality).toBe("720p")

    await makeShot(project.id, "Waves crash", { quality: "360p" })

    const [row] = await pieces()
    expect(row.resolution).toBe("360p")
    expect(row.model).toBe(VIDEO_MODEL)
    const listed = await listGenerations(user.id, project.id)
    expect(listed.quality).toBe("360p")
    expect(listed.generations[0].quality).toBe("Draft 360p")
    expect(listed.generations[0].model_name).toBe("Omni Flash")

    const sent = captureRequests()
    await videoGenerationTick()
    expect((JSON.parse(sent[0]) as OmniBody).response_format.resolution).toBe("360p")
  })

  it("prices a 16 second shot at $1.62 before it is made", async () => {
    const project = await seedFirstFrame()
    const shot = await makeShot(project.id, "Waves crash", { lengthSeconds: 16 })
    expect(shot.expected_cents).toBe(162)
    expect(shot.charged_cents).toBe(0)
  })
})

describe("what a finished piece costs", () => {
  it.skipIf(!hasFfmpeg)("charges what Google counted, and lists it on the shot", async () => {
    const project = await seedTwoPieceShot()
    googleFinishes(pieceVideo)

    await videoGenerationTick()

    const [event] = await database.select().from(customShellAiUsageEvents)
    expect(event.model).toBe(VIDEO_MODEL)
    expect(event.inputTokens).toBe(2000)
    expect(event.outputTokens).toBe(46336)
    // 2,000 x $1.50 + 46,336 x $17.50 a million = $0.814.
    expect(event.costCents).toBe(81)
    const { generations } = await listGenerations(user.id, project.id)
    expect(generations[0].charged_cents).toBe(81)
  })

  it.skipIf(!hasFfmpeg)("charges the seconds' expected tokens when Google sends no count", async () => {
    await seedTwoPieceShot()
    googleFinishes(pieceVideo, null)

    await videoGenerationTick()

    const [event] = await database.select().from(customShellAiUsageEvents)
    expect(event.outputTokens).toBe(46336)
    expect(event.costCents).toBe(81)
  })

  it("keeps a piece running when Google asks to be asked less often", async () => {
    await seedProcessingGeneration()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { message: "Too many" } }, { status: 429 }))
    )

    await videoGenerationTick()

    const [row] = await pieces()
    expect(row.status).toBe("processing")
    expect(row.errorMessage).toBeNull()
  })

  it("fails a running piece at once when every check is refused to a free key", async () => {
    // Seen 19 Oct 2026: Google accepted a free key's piece, then answered
    // every check this way, and the piece sat for 15 minutes.
    await seedProcessingGeneration()
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(FREE_TIER_ANSWER, { status: 429 })))

    await videoGenerationTick()

    const [row] = await pieces()
    expect(row.status).toBe("error")
    expect(row.errorMessage).toBe(FREE_KEY_MESSAGE)
    const [event] = await database.select().from(customShellAiUsageEvents)
    expect(event.status).toBe("failed")
    expect(event.costCents).toBe(0)
  })

  it("fails the piece with Google's reason when the job fails, and charges nothing", async () => {
    await seedProcessingGeneration()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ status: "failed", error: { message: "The prompt was blocked" } })
      )
    )

    await videoGenerationTick()

    const [row] = await pieces()
    expect(row.status).toBe("error")
    expect(row.errorMessage).toBe("Google could not generate the video: The prompt was blocked")
    const [event] = await database.select().from(customShellAiUsageEvents)
    expect(event.status).toBe("failed")
    expect(event.costCents).toBe(0)
  })
})

describe("shots asked for on Veo", () => {
  it("fails a Veo job still running, and Try again makes it on Omni Flash", async () => {
    await seedProcessingGeneration()
    await database
      .update(videoAiGenerations)
      .set({
        model: "veo-3.1-generate-preview",
        operationName: "models/veo-3.1-generate-preview/operations/old",
      })
    const provider = vi.fn()
    vi.stubGlobal("fetch", provider)

    await videoGenerationTick()

    expect(provider).not.toHaveBeenCalled()
    const [failed] = await pieces()
    expect(failed.status).toBe("error")
    expect(failed.errorMessage).toBe(
      "Google switched Veo off before this piece arrived. Press Try again to make it with Omni Flash."
    )
    const { generations } = await listGenerations(user.id, failed.projectId)
    expect(generations[0].model_name).toBe("Veo 3.1")

    await retryGeneration(user.id, "generation-1")
    const sent = captureRequests()
    await videoGenerationTick()

    const [started] = await pieces()
    expect(started.model).toBe(VIDEO_MODEL)
    expect(started.operationName).toBe("run-started")
    expect((JSON.parse(sent[0]) as { model: string }).model).toBe(VIDEO_MODEL)
  })
})

describe("what a shot is sent beyond the first frame", () => {
  async function insertPicture(id: string) {
    const timestamp = now()
    await database.insert(customShellMedia).values({
      id,
      workspaceId,
      userId: user.id,
      filename: `${id}.png`,
      originalName: `${id}.png`,
      fileSize: 8,
      mimeType: "image/png",
      fileType: "image",
      storagePath: `${user.id}/${id}.png`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  /** The seeded frame, made from two angles, a jacket and a kitchen. */
  async function seedDressedFrame() {
    const project = await seedFirstFrame()
    for (const id of ["side", "jacket", "kitchen"]) await insertPicture(id)
    const timestamp = now()
    await database.insert(videoExtras).values([
      { id: "extra-jacket", userId: user.id, kind: "clothing", name: "Green jacket", prompt: "green wool jacket", imageMediaId: "jacket", createdAt: timestamp, updatedAt: timestamp },
      { id: "extra-kitchen", userId: user.id, kind: "backdrop", name: "Kitchen", prompt: "bright kitchen, white tiles", imageMediaId: "kitchen", createdAt: timestamp, updatedAt: timestamp },
    ])
    await database
      .update(videoFirstFrames)
      .set({
        actorMediaIds: ["media-1", "side"],
        extras: [
          { kind: "backdrop", extra_id: "extra-kitchen", media_id: "kitchen" },
          { kind: "clothing", extra_id: "extra-jacket", media_id: "jacket" },
        ],
      })
      .where(eq(videoFirstFrames.id, "frame-1"))
    return project
  }

  const decoded = (data: string | undefined) => Buffer.from(data ?? "", "base64").toString()

  it("records the actor, the board's pictures, then the backdrop, on every piece", async () => {
    const project = await seedDressedFrame()
    const shot = await makeShot(project.id, "Pours a coffee", { lengthSeconds: 16 })
    for (const row of await pieces()) {
      expect(row.actorId).toBe("actor-1")
      expect(row.referenceMediaIds).toEqual(["media-1", "side", "jacket", "kitchen"])
      expect(row.extras.map((extra) => extra.kind)).toEqual(["clothing", "backdrop"])
    }
    expect(shot.actor_name).toBe("Actor")
    expect(shot.board_pictures).toBe(3)
    expect(shot.extras).toEqual(["Green jacket", "Kitchen"])
  })

  it("sends a 6 second piece the pictures too", async () => {
    const project = await seedDressedFrame()
    const shot = await makeShot(project.id, "Pours a coffee", { lengthSeconds: 6 })
    expect(shot.board_pictures).toBe(3)

    const sent = captureRequests()
    await videoGenerationTick()
    const body = JSON.parse(sent[0]) as OmniBody
    expect(body.input).toHaveLength(4)
    expect(body.response_format.duration).toBe("6s")
  })

  it("sends the first frame, the person board and the backdrop, named by tags", async () => {
    const project = await seedDressedFrame()
    await makeShot(project.id, "Pours a coffee")
    const sent = captureRequests()
    await videoGenerationTick()

    const body = JSON.parse(sent[0]) as OmniBody
    expect(body.input.slice(0, 3).map((part) => decoded(part.data))).toEqual([
      decoded(FRAME_DATA),
      "board:media-1,side,jacket",
      `${user.id}/kitchen.png`,
    ])
    expect(body.input[3].text?.split("\n\n")).toEqual([
      "[# Sources <FIRST_FRAME>@Image1] [# References <IMAGE_REF_0>@Image2 <IMAGE_REF_1>@Image3]",
      "Pours a coffee",
      "The person is: Actor.\nWearing: green wool jacket.\nThe place is: bright kitchen, white tiles.",
      "<IMAGE_REF_0> is a board of one person from several sides and what they wear and hold: show that one person, never the board. <IMAGE_REF_1> is the place.",
      "Use Image1 as the exact first frame. Use the reference images as references only, never as frames. Do not add captions or on-screen text.",
    ])
  })

  it("leaves out an extra deleted since, and keeps its picture on the record", async () => {
    const project = await seedDressedFrame()
    await makeShot(project.id, "Pours a coffee")
    await database.delete(videoExtras).where(eq(videoExtras.id, "extra-jacket"))
    const sent = captureRequests()
    await videoGenerationTick()

    const body = JSON.parse(sent[0]) as OmniBody
    expect(body.input.at(-1)?.text).not.toContain("Wearing")
    expect(decoded(body.input[1].data)).toBe("board:media-1,side,jacket")
    const { generations } = await listGenerations(user.id, project.id)
    expect(generations[0].extras).toEqual(["a removed extra", "Kitchen"])
  })

  it("sends a piece asked for before actors were recorded the first frame and words alone", async () => {
    const project = await seedDressedFrame()
    await makeShot(project.id, "Waves crash")
    // What migration 0124 leaves on a row written before it.
    await database
      .update(videoAiGenerations)
      .set({ actorId: null, referenceMediaIds: [], extras: [] })
    const sent = captureRequests()
    await videoGenerationTick()

    expect(JSON.parse(sent[0])).toEqual(
      omniRequestBody({
        prompt: videoPrompt(null, "Waves crash"),
        firstFrame: { mimeType: "image/png", data: FRAME_DATA },
        references: [],
        aspectRatio: "9:16",
        quality: "720p",
        seconds: 8,
      })
    )
    const { generations } = await listGenerations(user.id, project.id)
    expect(generations[0].actor_name).toBeNull()
  })
})
