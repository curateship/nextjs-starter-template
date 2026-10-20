import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { asc, eq } from "drizzle-orm"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  PERSON_SHOTS_FULL_MESSAGE,
  PROJECT_SHOTS_FULL_MESSAGE,
} from "@/lib/video/asset-factories"
import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import {
  customShellAiAllowanceOverrides,
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
  retryGeneration,
  veoPrompt,
  videoGenerationTick,
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
      model: "veo-3.1-generate-preview",
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

function makeShot(projectId: string, prompt: string) {
  return createGeneration(user.id, {
    projectId,
    firstFrameId: "frame-1",
    prompts: [prompt],
    lengthSeconds: 8,
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
      createGeneration(user.id, {
        projectId: fourth.id,
        firstFrameId: "frame-4",
        prompts: ["Move"],
        lengthSeconds: 8,
      })
    ).rejects.toThrow(PERSON_SHOTS_FULL_MESSAGE)
  })

  it("counts shots being made against the monthly allowance and names the shortfall", async () => {
    const project = await seedFirstFrame()
    await database.insert(customShellAiAllowanceOverrides).values({
      userId: user.id,
      monthlyCents: 800,
      createdAt: now(),
      updatedAt: now(),
    })
    // Two 8 second shots are 2 x $3.20 = $6.40 of the $8.00, and neither is
    // on the meter yet because Google charges when a shot arrives.
    await makeShot(project.id, "One")
    await makeShot(project.id, "Two")

    await expect(makeShot(project.id, "Three")).rejects.toThrow(
      "Your monthly AI allowance has $8.00 left. Shots still being made will take $6.40 of it, and this one costs $3.20, so it is $1.60 short."
    )
    expect(await pieces()).toHaveLength(2)
  })

  it("counts shots being made against the project's spend limit", async () => {
    const project = await seedFirstFrame()
    await database
      .update(videoProjects)
      .set({ spendLimitCents: 500 })
      .where(eq(videoProjects.id, project.id))
    await makeShot(project.id, "One")

    await expect(makeShot(project.id, "Two")).rejects.toThrow(
      "This project has spent $0.00 of its $5.00 limit, shots still being made will add $3.20, and this costs about $3.20, so the limit is $1.40 short. Raise the limit in the project's settings."
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
        if (url.endsWith(":predictLongRunning")) {
          started += 1
          return Response.json({ name: `operations/${started}` })
        }
        if (url.includes("operations/")) {
          const name = url.slice(url.indexOf("operations/"))
          checked.push(name)
          return name === "operations/3"
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
            : Response.json({ done: false })
        }
        // The start of an MP4 file, which is all the upload check reads.
        return new Response(
          Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom\0\0\0\0isommp42")]),
          { headers: { "Content-Type": "video/mp4" } }
        )
      })
    )

    await videoGenerationTick()
    await videoGenerationTick()
    await videoGenerationTick()
    expect(started).toBe(3)
    // Pass 2 checked shot 1; pass 3 checked shots 1 and 2.
    expect(checked.sort()).toEqual(["operations/1", "operations/1", "operations/2"])

    checked.length = 0
    await videoGenerationTick()
    expect(checked.sort()).toEqual(["operations/1", "operations/2", "operations/3"])
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
})

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
    await expect(
      createGeneration(user.id, {
        projectId: other.id,
        firstFrameId: "frame-1",
        prompts: ["Move"],
        lengthSeconds: 8,
      })
    ).rejects.toThrow("First frame not found")
  })
})

describe("the project's spend limit", () => {
  it("stops a shot that would take the project past its limit, before anything is made", async () => {
    const project = await seedFirstFrame()
    // An 8 second Veo shot is 8 x $0.40 = $3.20, and $3.00 is the limit.
    await database
      .update(videoProjects)
      .set({ spendLimitCents: 300 })
      .where(eq(videoProjects.id, project.id))

    await expect(
      createGeneration(user.id, {
        projectId: project.id,
        firstFrameId: "frame-1",
        prompts: ["Move"],
        lengthSeconds: 8,
      })
    ).rejects.toThrow(
      "This project has spent $0.00 of its $3.00 limit, and this costs about $3.20, so the limit is $0.20 short. Raise the limit in the project's settings."
    )
    expect(await pieces()).toEqual([])
  })

  it("lets the shot through when it fits under the limit", async () => {
    const project = await seedFirstFrame()
    await database
      .update(videoProjects)
      .set({ spendLimitCents: 500 })
      .where(eq(videoProjects.id, project.id))
    const shot = await createGeneration(user.id, {
      projectId: project.id,
      firstFrameId: "frame-1",
      prompts: ["Move"],
      lengthSeconds: 8,
    })
    expect(shot.status).toBe("queued")
  })
})

describe("the project's style in a Veo request", () => {
  it("puts the style line first, then the direction", () => {
    const prompt = veoPrompt("Flat illustration, warm palette", "Waves crash")
    expect(prompt.split("\n\n")).toEqual([
      "Style: Flat illustration, warm palette",
      "Waves crash",
      "Use the supplied image as the exact first frame. Do not add captions or on-screen text.",
    ])
  })

  it("sends what it always sent when the project has no style", () => {
    expect(veoPrompt(null, "Waves crash")).toBe(
      "Waves crash\n\nUse the supplied image as the exact first frame. Do not add captions or on-screen text."
    )
  })

  it("reads the style off the project when the clip starts", async () => {
    const project = await seedFirstFrame()
    await database
      .update(videoProjects)
      .set({ style: "Flat illustration, warm palette" })
      .where(eq(videoProjects.id, project.id))
    await createGeneration(user.id, {
      projectId: project.id,
      firstFrameId: "frame-1",
      prompts: ["Waves crash"],
      lengthSeconds: 8,
    })
    const sent: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        sent.push(String(init?.body))
        return Response.json({ name: "operations/started" })
      })
    )

    await videoGenerationTick()

    expect(sent).toHaveLength(1)
    const body = JSON.parse(sent[0]) as { instances: { prompt: string }[] }
    expect(body.instances[0].prompt).toBe(
      veoPrompt("Flat illustration, warm palette", "Waves crash", {
        lines: ["The person is: Actor."],
        references: { board: false, backdrop: false },
      })
    )
    const [row] = await pieces()
    expect(row.operationName).toBe("operations/started")
  })
})

describe("what Veo is sent beyond the first frame", () => {
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

  function captureRequests() {
    const sent: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        sent.push(String(init?.body))
        return Response.json({ name: "operations/started" })
      })
    )
    return sent
  }

  type VeoBody = {
    instances: {
      prompt: string
      image: unknown
      referenceImages?: {
        image: { inlineData: { mimeType: string; data: string } }
        referenceType: string
      }[]
    }[]
    parameters: unknown
  }

  const decoded = (data: string) => Buffer.from(data, "base64").toString()

  it("records the actor, the board's pictures, then the backdrop, on every piece", async () => {
    const project = await seedDressedFrame()
    const shot = await createGeneration(user.id, {
      projectId: project.id,
      firstFrameId: "frame-1",
      prompts: ["Pours a coffee", "Drinks it"],
      lengthSeconds: 16,
    })
    for (const row of await pieces()) {
      expect(row.actorId).toBe("actor-1")
      expect(row.referenceMediaIds).toEqual(["media-1", "side", "jacket", "kitchen"])
      expect(row.extras.map((extra) => extra.kind)).toEqual(["clothing", "backdrop"])
    }
    expect(shot.actor_name).toBe("Actor")
    expect(shot.board_pictures).toBe(3)
    expect(shot.extras).toEqual(["Green jacket", "Kitchen"])
  })

  it("sends a 4 or 6 second piece the words and no pictures", async () => {
    const project = await seedDressedFrame()
    const shot = await createGeneration(user.id, {
      projectId: project.id,
      firstFrameId: "frame-1",
      prompts: ["Pours a coffee"],
      lengthSeconds: 6,
    })
    const [row] = await pieces()
    expect(row.referenceMediaIds).toEqual([])
    expect(shot.board_pictures).toBe(0)

    const sent = captureRequests()
    await videoGenerationTick()
    const body = JSON.parse(sent[0]) as VeoBody
    expect(body.instances[0].referenceImages).toBeUndefined()
    expect(body.instances[0].prompt).toBe(
      veoPrompt(null, "Pours a coffee", {
        lines: [
          "The person is: Actor.",
          "Wearing: green wool jacket.",
          "The place is: bright kitchen, white tiles.",
        ],
        references: null,
      })
    )
  })

  it("sends the person board and the backdrop as reference pictures on an 8 second piece", async () => {
    const project = await seedDressedFrame()
    await createGeneration(user.id, {
      projectId: project.id,
      firstFrameId: "frame-1",
      prompts: ["Pours a coffee"],
      lengthSeconds: 8,
    })
    const sent = captureRequests()
    await videoGenerationTick()

    const body = JSON.parse(sent[0]) as VeoBody
    const references = body.instances[0].referenceImages ?? []
    expect(references.map((reference) => reference.referenceType)).toEqual(["asset", "asset"])
    expect(references.map((reference) => decoded(reference.image.inlineData.data))).toEqual([
      "board:media-1,side,jacket",
      `${user.id}/kitchen.png`,
    ])
    expect(body.instances[0].prompt.split("\n\n")).toEqual([
      "Pours a coffee",
      "The person is: Actor.\nWearing: green wool jacket.\nThe place is: bright kitchen, white tiles.",
      "The first reference picture is a board of one person from several sides and what they wear and hold: show that one person, never the board. The last reference picture is the place.",
      "Use the supplied image as the exact first frame. Do not add captions or on-screen text.",
    ])
  })

  it("leaves out an extra deleted since, and keeps its picture on the record", async () => {
    const project = await seedDressedFrame()
    await createGeneration(user.id, {
      projectId: project.id,
      firstFrameId: "frame-1",
      prompts: ["Pours a coffee"],
      lengthSeconds: 8,
    })
    await database.delete(videoExtras).where(eq(videoExtras.id, "extra-jacket"))
    const sent = captureRequests()
    await videoGenerationTick()

    const body = JSON.parse(sent[0]) as VeoBody
    expect(body.instances[0].prompt).not.toContain("Wearing")
    expect(
      decoded(body.instances[0].referenceImages![0].image.inlineData.data)
    ).toBe("board:media-1,side,jacket")
    const { generations } = await listGenerations(user.id, project.id)
    expect(generations[0].extras).toEqual(["a removed extra", "Kitchen"])
  })

  it("sends a piece asked for before this change exactly what it always sent", async () => {
    const project = await seedDressedFrame()
    await createGeneration(user.id, {
      projectId: project.id,
      firstFrameId: "frame-1",
      prompts: ["Waves crash"],
      lengthSeconds: 8,
    })
    // What the migration leaves on a row written before it.
    await database
      .update(videoAiGenerations)
      .set({ actorId: null, referenceMediaIds: [], extras: [] })
    const sent = captureRequests()
    await videoGenerationTick()

    expect(JSON.parse(sent[0])).toEqual({
      instances: [
        {
          prompt: veoPrompt(null, "Waves crash"),
          image: {
            inlineData: {
              mimeType: "image/png",
              data: Buffer.from(new Uint8Array([137, 80, 78, 71])).toString("base64"),
            },
          },
        },
      ],
      parameters: {
        aspectRatio: "9:16",
        durationSeconds: "8",
        resolution: "720p",
        personGeneration: "allow_adult",
      },
    })
    const { generations } = await listGenerations(user.id, project.id)
    expect(generations[0].actor_name).toBeNull()
  })
})
