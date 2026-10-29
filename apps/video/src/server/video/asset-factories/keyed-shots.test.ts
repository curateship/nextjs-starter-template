import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PROJECT_SHOTS_FULL_MESSAGE } from "@/lib/video/asset-factories"
import { now } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import {
  customShellAiUsageEvents,
  customShellMedia,
  type CustomShellUser,
} from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import {
  createComparison,
  createGeneration,
  retryGeneration,
  videoChoices,
  videoGenerationTick,
} from "@/server/video/asset-factories/generations"
import { createOwnedProject } from "@/server/video/projects"
import { videoActors, videoAiGenerations, videoFirstFrames } from "@/server/video/schema"
import {
  saveAiDefaults,
  saveVideoKey,
  saveVideoRegion,
} from "@/server/video/settings"

/**
 * Wan and Seedance shots, from asking to the meter
 * (`workspace/docs/wan-and-seedance.md`). Nothing reaches either company:
 * every request is answered by a stand-in, in the shape the companies' pages
 * show (read 29 Oct 2026).
 */

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  uploadToR2: async () => undefined,
  deleteFromR2: async () => undefined,
  getPublicMediaUrl: async (storagePath: string) => `https://media.test/${storagePath}`,
  getFromR2: async () => ({
    Body: { transformToByteArray: async () => new Uint8Array([137, 80, 78, 71]) },
  }),
}))

vi.mock("@/server/video/asset-factories/person-board", () => ({
  readStoredPicture: async (storagePath: string) => new TextEncoder().encode(storagePath),
  buildPersonBoard: async (tiles: { id: string }[]) => ({
    bytes: new TextEncoder().encode(`board:${tiles.map((tile) => tile.id).join(",")}`),
    mimeType: "image/jpeg",
    tileMediaIds: tiles.map((tile) => tile.id),
  }),
  shrinkReference: async (bytes: Uint8Array) => ({ bytes, mimeType: "image/jpeg" }),
}))

/** The start of an MP4 file, which is all the upload check reads. */
const MP4_START = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom\0\0\0\0isommp42")])

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string
const saved = {
  gemini: process.env.CUSTOM_SHELL_GEMINI_API_KEY,
  secret: process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY,
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
  delete process.env.CUSTOM_SHELL_GEMINI_API_KEY
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "test-secret"
})

afterEach(async () => {
  await client.close()
  vi.unstubAllGlobals()
  for (const [name, value] of [
    ["CUSTOM_SHELL_GEMINI_API_KEY", saved.gemini],
    ["CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", saved.secret],
  ] as const) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

async function seedMedia(id: string, fileType: "image" | "audio", name: string) {
  const timestamp = now()
  await database.insert(customShellMedia).values({
    id,
    workspaceId,
    userId: user.id,
    filename: name,
    originalName: name,
    altText: name,
    fileSize: 8,
    mimeType: fileType === "image" ? "image/png" : "audio/mpeg",
    fileType,
    storagePath: `${user.id}/${name}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

async function seedFrames() {
  const timestamp = now()
  const project = await createOwnedProject(user.id, "Keyed test", database)
  await seedMedia("media-1", "image", "frame.png")
  await seedMedia("media-2", "image", "end.png")
  await seedMedia("voice-1", "audio", "voice.mp3")
  await database.insert(videoActors).values({
    id: "actor-1",
    userId: user.id,
    name: "Mia",
    prompt: "A woman with short red hair",
    model: "gemini-2.5-flash-image",
    status: "active",
    tags: [],
    imageMediaId: "media-1",
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  const frame = {
    userId: user.id,
    projectId: project.id,
    actorId: "actor-1",
    prompt: "Frame",
    model: "gemini-2.5-flash-image",
    aspectRatio: "9:16",
    tags: [],
    pinned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await database.insert(videoFirstFrames).values([
    { ...frame, id: "frame-1", name: "Kitchen", imageMediaId: "media-1" },
    { ...frame, id: "frame-2", name: "Doorway", imageMediaId: "media-2" },
  ])
  return project
}

function shotFor(
  projectId: string,
  making: Partial<Parameters<typeof createGeneration>[1]> = {}
) {
  return createGeneration(user.id, {
    projectId,
    firstFrameId: "frame-1",
    prompts: ["She waves"],
    lengthSeconds: 4,
    quality: "720p",
    ...making,
  })
}

/** Stands in for a company: answers by address, and keeps what it was sent. */
function stubCompany(answer: (url: string, init?: RequestInit) => Response) {
  const sent: { url: string; body: unknown }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
      return answer(url, init)
    })
  )
  return sent
}

describe("Wan shots", () => {
  it("starts on Wan with the actor's pictures, then saves the file and charges Wan's seconds", async () => {
    const project = await seedFrames()
    await saveVideoKey("wan", "test-wan-key")
    const shot = await shotFor(project.id, { company: "wan" })
    expect(shot).toMatchObject({ model_name: "Wan 2.7", company: "wan", expected_cents: 40 })

    const sent = stubCompany((url) =>
      url.includes("/video-synthesis")
        ? Response.json({ output: { task_id: "task-1", task_status: "PENDING" } })
        : Response.json({})
    )
    await videoGenerationTick()
    expect(sent[0].url).toBe(
      "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis"
    )
    expect(sent[0].body).toMatchObject({
      model: "wan2.7-r2v",
      parameters: { resolution: "720P", duration: 4, ratio: "9:16" },
    })
    const media = (sent[0].body as { input: { media: { type: string }[] } }).input.media
    expect(media.map((item) => item.type)).toEqual(["first_frame", "reference_image"])
    const [started] = await database.select().from(videoAiGenerations)
    expect(started).toMatchObject({ status: "processing", operationName: "intl:task-1" })

    const checked = stubCompany((url) =>
      url.endsWith("/api/v1/tasks/task-1")
        ? Response.json({
            output: {
              task_status: "SUCCEEDED",
              video_url: "https://dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com/a.mp4",
            },
            usage: { output_video_duration: 4 },
          })
        : new Response(MP4_START)
    )
    await videoGenerationTick()
    expect(checked.map((call) => call.url)).toEqual([
      "https://dashscope-intl.aliyuncs.com/api/v1/tasks/task-1",
      "https://dashscope-result-sg.oss-ap-southeast-1.aliyuncs.com/a.mp4",
    ])
    const [ready] = await database.select().from(videoAiGenerations)
    expect(ready.status).toBe("ready")
    const usage = await database.select().from(customShellAiUsageEvents)
    expect(usage).toEqual([
      expect.objectContaining({
        provider: "wan",
        model: "wan2.7",
        feature: "video-generation",
        status: "success",
        costCents: 40,
        metadata: expect.objectContaining({
          projectId: project.id,
          shotId: shot.id,
          units: 4,
        }),
      }),
    ])
  })

  it("sends the end picture or the voiceover instead of the actor's pictures", async () => {
    const project = await seedFrames()
    await saveVideoKey("wan", "test-wan-key")
    await shotFor(project.id, { company: "wan", endFrameId: "frame-2" })
    const sent = stubCompany(() => Response.json({ output: { task_id: "task-2" } }))
    await videoGenerationTick()
    expect(sent[0].body).toMatchObject({ model: "wan2.7-i2v-2026-04-25" })
    const media = (sent[0].body as { input: { media: { type: string; url: string }[] } }).input.media
    expect(media.map((item) => item.type)).toEqual(["first_frame", "last_frame"])

    await shotFor(project.id, { company: "wan", voiceMediaId: "voice-1", prompts: ["She talks"] })
    // The first shot is asked about in the same pass, so the start is the one with a body.
    const voiced = stubCompany(() => Response.json({ output: { task_id: "task-3" } }))
    await videoGenerationTick()
    const voiceMedia = (voiced.find((call) => call.body)!.body as { input: { media: { type: string; url: string }[] } })
      .input.media
    expect(voiceMedia).toContainEqual({
      type: "driving_audio",
      url: `https://media.test/${user.id}/voice.mp3`,
    })
  })

  it("asks on the site the job was started on, and fails a job Wan no longer has", async () => {
    const project = await seedFrames()
    await saveVideoKey("wan", "test-wan-key")
    await saveVideoRegion("wan", "china")
    await shotFor(project.id, { company: "wan" })
    stubCompany(() => Response.json({ output: { task_id: "task-4" } }))
    await videoGenerationTick()
    const sent = stubCompany(() => Response.json({ output: { task_status: "UNKNOWN" } }))
    await videoGenerationTick()
    expect(sent[0].url).toBe("https://dashscope.aliyuncs.com/api/v1/tasks/task-4")
    const [failed] = await database.select().from(videoAiGenerations)
    expect(failed).toMatchObject({
      status: "error",
      errorMessage: "Wan no longer has this job. Press Try again to make it again.",
    })
    const usage = await database.select().from(customShellAiUsageEvents)
    expect(usage).toEqual([
      expect.objectContaining({ provider: "wan", status: "failed", costCents: 0 }),
    ])
  })

  it("refuses a file from anywhere but Wan's own storage", async () => {
    const project = await seedFrames()
    await saveVideoKey("wan", "test-wan-key")
    await shotFor(project.id, { company: "wan" })
    stubCompany(() => Response.json({ output: { task_id: "task-5" } }))
    await videoGenerationTick()
    const sent = stubCompany(() =>
      Response.json({
        output: { task_status: "SUCCEEDED", video_url: "https://evil.test/a.mp4" },
      })
    )
    await videoGenerationTick()
    expect(sent).toHaveLength(1)
    const [failed] = await database.select().from(videoAiGenerations)
    expect(failed.errorMessage).toBe("Wan returned an invalid video address")
  })
})

describe("Seedance shots", () => {
  it("sends the first frame alone, without sound when asked, and charges the tokens it billed", async () => {
    const project = await seedFrames()
    await saveVideoKey("seedance", "ark-1234")
    const shot = await shotFor(project.id, { company: "seedance", sound: false })
    expect(shot.company).toBe("seedance")
    const sent = stubCompany(() => Response.json({ id: "cgt-1" }))
    await videoGenerationTick()
    expect(sent[0].url).toBe(
      "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks"
    )
    const body = sent[0].body as { content: { type: string; role?: string }[]; generate_audio: boolean }
    expect(body.content.map((item) => item.role ?? item.type)).toEqual(["text", "first_frame"])
    expect(body.generate_audio).toBe(false)

    stubCompany((url) =>
      url.endsWith("/tasks/cgt-1")
        ? Response.json({
            status: "succeeded",
            content: { video_url: "https://ark-content.tos-ap-southeast-1.volces.com/a.mp4" },
            usage: { completion_tokens: 100000 },
          })
        : new Response(MP4_START)
    )
    await videoGenerationTick()
    const usage = await database.select().from(customShellAiUsageEvents)
    // 100,000 tokens at $1.20 a million without sound is 12¢.
    expect(usage).toEqual([
      expect.objectContaining({
        provider: "seedance",
        outputTokens: 100000,
        costCents: 12,
        status: "success",
      }),
    ])
  })

  it("says plainly when Seedance refuses the key, never its own words", async () => {
    const project = await seedFrames()
    await saveVideoKey("seedance", "ark-1234")
    await shotFor(project.id, { company: "seedance" })
    stubCompany(
      () =>
        new Response(
          JSON.stringify({ error: { code: "AuthenticationError", message: "secret detail" } }),
          { status: 401 }
        )
    )
    await videoGenerationTick()
    const [failed] = await database.select().from(videoAiGenerations)
    expect(failed.errorMessage).toMatch(/^Seedance refused the key in Settings → AI video/)
    expect(failed.errorMessage).not.toContain("secret detail")
  })

  it("refuses a voiceover, which only Wan can say", async () => {
    const project = await seedFrames()
    await saveVideoKey("seedance", "ark-1234")
    await expect(
      shotFor(project.id, { company: "seedance", voiceMediaId: "voice-1" })
    ).rejects.toThrow("Seedance 1.5 Pro cannot make someone say a voiceover")
  })
})

describe("picking a company", () => {
  it("refuses a company with no key, saying where the key goes", async () => {
    const project = await seedFrames()
    await expect(shotFor(project.id, { company: "wan" })).rejects.toThrow(
      "Add a Wan key in Settings → AI video first"
    )
  })

  it("starts new shots on the saved company and its saved size, length and sound", async () => {
    await saveVideoKey("seedance", "ark-1234")
    await saveAiDefaults({
      videoModel: "seedance",
      videoModelDefaults: { seedance: { size: "480p", length: 6, sound: false } },
    })
    const choices = await videoChoices()
    expect(choices.company).toBe("seedance")
    expect(choices.ready).toEqual({ gemini: false, wan: false, seedance: true })
    expect(choices.starts.seedance).toEqual({ size: "480p", length: 6, sound: false })
  })

  it("falls back to Google when the saved company's key is removed", async () => {
    await saveAiDefaults({ videoModel: "wan" })
    expect((await videoChoices()).company).toBe("gemini")
  })

  it("Try again keeps a Wan shot on Wan", async () => {
    const project = await seedFrames()
    await saveVideoKey("wan", "test-wan-key")
    const shot = await shotFor(project.id, { company: "wan" })
    stubCompany(() => new Response("{}", { status: 500 }))
    await videoGenerationTick()
    const retried = await retryGeneration(user.id, shot.id)
    expect(retried).toMatchObject({ company: "wan", status: "queued" })
  })
})

describe("one prompt on every model", () => {
  it("makes one shot on each company with a key, side by side", async () => {
    const project = await seedFrames()
    process.env.CUSTOM_SHELL_GEMINI_API_KEY = "test-key"
    await saveVideoKey("wan", "test-wan-key")
    await saveVideoKey("seedance", "ark-1234")
    const shots = await createComparison(user.id, {
      projectId: project.id,
      firstFrameId: "frame-1",
      prompts: ["She waves"],
      lengthSeconds: 4,
    })
    expect(shots.map((shot) => shot.company)).toEqual(["gemini", "wan", "seedance"])
    expect(new Set(shots.map((shot) => shot.pieces[0].prompt))).toEqual(new Set(["She waves"]))
  })

  it("refuses them all when the project has no room for every one", async () => {
    const project = await seedFrames()
    process.env.CUSTOM_SHELL_GEMINI_API_KEY = "test-key"
    await saveVideoKey("wan", "test-wan-key")
    await shotFor(project.id, { company: "gemini" })
    await shotFor(project.id, { company: "gemini" })
    await expect(
      createComparison(user.id, {
        projectId: project.id,
        firstFrameId: "frame-1",
        prompts: ["She waves"],
        lengthSeconds: 4,
      })
    ).rejects.toThrow(PROJECT_SHOTS_FULL_MESSAGE)
    const rows = await database
      .select()
      .from(videoAiGenerations)
      .where(eq(videoAiGenerations.projectId, project.id))
    expect(rows).toHaveLength(2)
  })

  it("needs keys for at least two models", async () => {
    const project = await seedFrames()
    await saveVideoKey("wan", "test-wan-key")
    await expect(
      createComparison(user.id, {
        projectId: project.id,
        firstFrameId: "frame-1",
        prompts: ["She waves"],
        lengthSeconds: 4,
      })
    ).rejects.toThrow("Trying a shot on several models needs keys for at least two of them")
  })
})
