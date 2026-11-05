import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AI_SOUND_FAILED_MESSAGE, AI_SOUND_LENGTH_MESSAGE, aiSoundCostCents } from "@/lib/video/ai-sound-effects"
import { ELEVENLABS_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"
import { type ProjectTimeline } from "@/lib/video/timeline-schema"
import { type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents, customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { videoSoundEffects } from "@/server/video/schema"

/**
 * A sound effect made from words (ai-sound-effects.md), against a test
 * database with ElevenLabs and storage stood in for. Nothing reaches
 * ElevenLabs.
 */

const stand = vi.hoisted(() => ({
  db: null as unknown,
  key: "key" as string | null,
  workspaceId: "",
  uploads: [] as string[],
  asked: [] as { url: string; body: Record<string, unknown> }[],
  answer: { status: 200, bytes: new Uint8Array([1, 2, 3]) },
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

const { makeAiSoundEffect } = await import("@/server/video/ai-sound-effects")
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
              kind: "text",
              name: "Text",
              text: "Hi",
              fontId: "inter",
              startMs: 0,
              durationMs: 42_000,
              trimStartMs: 0,
            },
          ],
        },
      ],
    } satisfies ProjectTimeline as never,
    1,
    database
  )
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    stand.asked.push({ url, body: JSON.parse(init.body) })
    return new Response(stand.answer.bytes, { status: stand.answer.status })
  })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await client.close()
})

describe("a sound effect from words", () => {
  it("asks for the words at the length typed, and prices it by that length", async () => {
    const made = await makeAiSoundEffect({ userId: user.id, videoId, words: "  door slam ", seconds: 2 })
    expect(stand.asked).toHaveLength(1)
    expect(stand.asked[0].url).toContain("/v1/sound-generation")
    expect(stand.asked[0].body).toEqual({ text: "door slam", model_id: "eleven_text_to_sound_v2", duration_seconds: 2 })
    expect(made.cents).toBe(aiSoundCostCents(2))
    expect(made.cents).toBe(1)
  })

  it("lets ElevenLabs choose the length when none is typed, priced at the 30 second cap", async () => {
    const made = await makeAiSoundEffect({ userId: user.id, videoId, words: "rain", seconds: null })
    expect(stand.asked[0].body).toEqual({ text: "rain", model_id: "eleven_text_to_sound_v2" })
    expect(made.cents).toBe(6)
  })

  it("keeps it in the library and in Your sounds, and on the meter", async () => {
    const made = await makeAiSoundEffect({ userId: user.id, videoId, words: "door slam", seconds: 2 })
    const [media] = await database.select().from(customShellMedia).where(eq(customShellMedia.id, made.media.id))
    expect(media.originalName).toBe("door slam.mp3")
    expect(await database.select().from(videoSoundEffects)).toEqual([expect.objectContaining({ mediaId: made.media.id })])
    const [row] = await database.select().from(customShellAiUsageEvents)
    expect(row).toMatchObject({ provider: "elevenlabs", feature: "ai_sound_effect", costCents: 1, status: "success" })
    expect(row.metadata).toMatchObject({ videoId })
  })

  it("refuses a length the API won't take, and says so when ElevenLabs fails", async () => {
    await expect(makeAiSoundEffect({ userId: user.id, videoId, words: "x", seconds: 45 })).rejects.toThrow(AI_SOUND_LENGTH_MESSAGE)
    stand.answer = { status: 500, bytes: new Uint8Array() }
    await expect(makeAiSoundEffect({ userId: user.id, videoId, words: "x", seconds: 1 })).rejects.toThrow(AI_SOUND_FAILED_MESSAGE)
    const [row] = await database.select().from(customShellAiUsageEvents)
    expect(row).toMatchObject({ status: "failed", costCents: 0 })
    expect(await database.select().from(customShellMedia)).toEqual([])
  })

  it("needs the ElevenLabs key", async () => {
    stand.key = null
    await expect(makeAiSoundEffect({ userId: user.id, videoId, words: "x", seconds: 1 })).rejects.toThrow(ELEVENLABS_KEY_MISSING_MESSAGE)
  })
})
