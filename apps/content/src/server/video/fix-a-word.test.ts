import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FIX_WORD_SAMPLE_TOO_SHORT_MESSAGE } from "@/lib/video/fix-a-word"
import { writeFile } from "node:fs/promises"
import { ELEVENLABS_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"
import { type ProjectTimeline } from "@/lib/video/timeline-schema"
import { type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents, customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { videoMediaVoiceCopies } from "@/server/video/schema"
import { uuid } from "@/server/auth/security"

/**
 * Fix a word (fix-a-word.md) against a test database, with ElevenLabs,
 * ffmpeg and storage stood in for. Nothing reaches ElevenLabs.
 */

const stand = vi.hoisted(() => ({
  db: null as unknown,
  key: "key" as string | null,
  workspaceId: "",
  uploads: [] as string[],
  asked: [] as { url: string; body: Record<string, unknown> }[],
  answer: { status: 200, bytes: new Uint8Array([1, 2, 3]) },
  sampleMs: 30_000,
}))

vi.mock("@/server/video/sound-source", () => ({
  openSoundSource: async () => ({ input: "/recording.mp4", release: async () => undefined, streamsBigOriginal: false }),
}))
vi.mock("@/server/video/ffmpeg", () => ({
  runFfmpeg: async (args: string[]) => {
    await writeFile(args.at(-1)!, new Uint8Array([9]))
    return ""
  },
}))
vi.mock("@/server/video/voice", () => ({ soundDurationMs: async () => stand.sampleMs }))

vi.mock("@/server/db", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  return {
    ...real,
    get db() {
      return stand.db
    },
  }
})
vi.mock("@/server/ai/keys", () => ({ getAiKey: async () => stand.key }))
vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  uploadToR2: async (storagePath: string) => {
    stand.uploads.push(storagePath)
  },
  deleteFromR2: async () => undefined,
  getPublicMediaUrl: async (storagePath: string) => `https://media.test/${storagePath}`,
}))
vi.mock("@/server/workspaces/for-request", () => ({
  workspaceIdForRequest: async () => stand.workspaceId,
}))

const { sayWordsAgain } = await import("@/server/video/fix-a-word")
const { createOwnedProject } = await import("@/server/video/projects")
const { writeVideoTimeline } = await import("@/server/video/project-videos")

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let videoId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  stand.db = database
  stand.key = "key"
  stand.uploads = []
  stand.asked = []
  stand.answer = { status: 200, bytes: new Uint8Array([1, 2, 3]) }
  user = await insertUser(database)
  stand.workspaceId = (await insertWorkspace(database)).id
  const made = await createOwnedProject(user.id, "Cooking", database)
  videoId = made.video
  await writeVideoTimeline(
    user.id,
    videoId,
    {
      aspect: "9:16",
      tracks: [
        {
          id: "t1",
          muted: false,
          clips: [
            {
              id: "c1",
              kind: "video",
              name: "Talk",
              mediaId: "recording",
              startMs: 0,
              durationMs: 42_000,
              trimStartMs: 2_000,
            },
          ],
        },
      ],
    } satisfies ProjectTimeline as never,
    1,
    database
  )
  stand.sampleMs = 30_000
  await database.insert(customShellMedia).values({
    id: "recording",
    workspaceId: stand.workspaceId,
    userId: user.id,
    filename: "r.mp4",
    originalName: "Talk.mp4",
    fileSize: 10,
    mimeType: "video/mp4",
    fileType: "video",
    storagePath: `${user.id}/${uuid()}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  vi.stubGlobal("fetch", async (url: string, init: { body: unknown }) => {
    stand.asked.push({ url, body: typeof init.body === "string" ? JSON.parse(init.body) : {} })
    if (url.endsWith("/v1/voices/add")) return Response.json({ voice_id: "voice-copy-1" })
    return Response.json({
      audio_base64: Buffer.from([1, 2, 3]).toString("base64"),
      alignment: {
        characters: [..."Thursday"],
        character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
        character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
      },
    })
  })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await client.close()
})

describe("fixing a word", () => {
  it("copies the voice once, says the words in it and keeps the sound", async () => {
    const made = await sayWordsAgain({ userId: user.id, videoId, clipId: "c1", text: " Thursday ", database })
    expect(stand.asked.map((ask) => ask.url.replace("https://api.elevenlabs.io", ""))).toEqual([
      "/v1/voices/add",
      "/v1/text-to-speech/voice-copy-1/with-timestamps",
    ])
    expect(stand.asked[1].body).toMatchObject({ text: "Thursday", model_id: "eleven_multilingual_v2" })
    expect(made.durationMs).toBe(800)
    const [media] = await database.select().from(customShellMedia).where(eq(customShellMedia.id, made.mediaId))
    expect(media.originalName).toBe("Fixed - Thursday.mp3")
    expect(await database.select().from(videoMediaVoiceCopies)).toEqual([
      expect.objectContaining({ mediaId: "recording", voiceId: "voice-copy-1" }),
    ])

    stand.asked = []
    await sayWordsAgain({ userId: user.id, videoId, clipId: "c1", text: "Friday", database })
    expect(stand.asked).toHaveLength(1)
  })

  it("keeps one voice copy when two fixes in a new recording start at once", async () => {
    let made = 0
    vi.stubGlobal("fetch", async (url: string, init: { method?: string; body: unknown }) => {
      stand.asked.push({ url: `${init.method ?? "GET"} ${url}`, body: {} })
      if (url.endsWith("/v1/voices/add")) {
        made += 1
        const id = `voice-copy-${made}`
        // Both copies are asked for before either is kept.
        await new Promise((resolve) => setTimeout(resolve, 20))
        return Response.json({ voice_id: id })
      }
      if (init.method === "DELETE") return new Response(null, { status: 200 })
      return Response.json({ audio_base64: Buffer.from([1]).toString("base64"), alignment: null })
    })
    stand.sampleMs = 30_000
    const both = await Promise.allSettled([
      sayWordsAgain({ userId: user.id, videoId, clipId: "c1", text: "Thursday", database }),
      sayWordsAgain({ userId: user.id, videoId, clipId: "c1", text: "Friday", database }),
    ])
    expect(both.map((one) => one.status)).toEqual(["fulfilled", "fulfilled"])
    const kept = await database.select().from(videoMediaVoiceCopies)
    expect(kept).toHaveLength(1)
    const extra = kept[0].voiceId === "voice-copy-1" ? "voice-copy-2" : "voice-copy-1"
    expect(stand.asked.map((ask) => ask.url)).toContain(`DELETE https://api.elevenlabs.io/v1/voices/${extra}`)
    expect(stand.asked.filter((ask) => ask.url.includes("text-to-speech/")).map((ask) => ask.url)).toEqual([
      expect.stringContaining(`/${kept[0].voiceId}/`),
      expect.stringContaining(`/${kept[0].voiceId}/`),
    ])
  })

  it("puts the reading on the meter against the video", async () => {
    await sayWordsAgain({ userId: user.id, videoId, clipId: "c1", text: "Thursday", database })
    const [row] = await database.select().from(customShellAiUsageEvents)
    expect(row).toMatchObject({ provider: "elevenlabs", feature: "fix_a_word", status: "success" })
    expect(row.metadata).toMatchObject({ videoId, characters: 8 })
  })

  it("needs ten seconds of the recording to copy the voice from", async () => {
    stand.sampleMs = 4_000
    await expect(
      sayWordsAgain({ userId: user.id, videoId, clipId: "c1", text: "Thursday", database })
    ).rejects.toThrow(FIX_WORD_SAMPLE_TOO_SHORT_MESSAGE)
    expect(stand.asked).toEqual([])
  })

  it("needs the ElevenLabs key", async () => {
    stand.key = null
    await expect(
      sayWordsAgain({ userId: user.id, videoId, clipId: "c1", text: "x", database })
    ).rejects.toThrow(ELEVENLABS_KEY_MISSING_MESSAGE)
  })
})
