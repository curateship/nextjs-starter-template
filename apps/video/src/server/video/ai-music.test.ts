import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AI_MUSIC_FAILED_MESSAGE, aiMusicCostCents, aiMusicLengthMs } from "@/lib/video/ai-music"
import { ELEVENLABS_KEY_MISSING_MESSAGE } from "@/lib/video/ai-providers"
import { type ProjectTimeline } from "@/lib/video/timeline-schema"
import { type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents, customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { videoMusicTracks, videoProjectVideos } from "@/server/video/schema"

/**
 * Music made to fit (ai-music.md), run against a test database with
 * ElevenLabs and storage stood in for: what is asked for, where the track
 * lands, and what the meter says. Nothing reaches ElevenLabs.
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

const { makeAiMusic } = await import("@/server/video/ai-music")
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

describe("music made to fit", () => {
  it("asks for an instrumental track as long as the video", async () => {
    const made = await makeAiMusic({ userId: user.id, videoId, mood: "  calm piano, hopeful " })
    expect(stand.asked).toHaveLength(1)
    expect(stand.asked[0].url).toContain("/v1/music")
    expect(stand.asked[0].body).toEqual({
      prompt: "calm piano, hopeful",
      music_length_ms: 42_000,
      model_id: "music_v1",
      force_instrumental: true,
    })
    expect(made.lengthMs).toBe(42_000)
    expect(made.cents).toBe(21)
  })

  it("keeps it in the library and on the Music list", async () => {
    const made = await makeAiMusic({ userId: user.id, videoId, mood: "calm piano" })
    const [media] = await database.select().from(customShellMedia).where(eq(customShellMedia.id, made.media.id))
    expect(media.originalName).toBe("Music - calm piano.mp3")
    expect(media.fileType).toBe("audio")
    expect(await database.select().from(videoMusicTracks)).toEqual([
      expect.objectContaining({ mediaId: made.media.id }),
    ])
    expect(stand.uploads).toHaveLength(1)
  })

  it("puts the charge on the meter against the video", async () => {
    await makeAiMusic({ userId: user.id, videoId, mood: "calm piano" })
    const [row] = await database.select().from(customShellAiUsageEvents)
    expect(row).toMatchObject({ provider: "elevenlabs", feature: "ai_music", costCents: 21, status: "success" })
    expect(row.metadata).toMatchObject({ videoId })
  })

  it("charges nothing and keeps nothing when ElevenLabs refuses", async () => {
    stand.answer = { status: 500, bytes: new Uint8Array() }
    await expect(makeAiMusic({ userId: user.id, videoId, mood: "calm" })).rejects.toThrow(
      AI_MUSIC_FAILED_MESSAGE
    )
    const rows = await database.select().from(customShellAiUsageEvents)
    expect(rows).toEqual([expect.objectContaining({ status: "failed", costCents: 0 })])
    expect(await database.select().from(customShellMedia)).toEqual([])
  })

  it("asks nothing without a key, or past the video's spend limit", async () => {
    stand.key = null
    await expect(makeAiMusic({ userId: user.id, videoId, mood: "calm" })).rejects.toThrow(
      ELEVENLABS_KEY_MISSING_MESSAGE
    )
    stand.key = "key"
    await database.update(videoProjectVideos).set({ spendLimitCents: 10 }).where(eq(videoProjectVideos.id, videoId))
    await expect(makeAiMusic({ userId: user.id, videoId, mood: "calm" })).rejects.toThrow()
    expect(stand.asked).toHaveLength(0)
  })
})

describe("length and price", () => {
  it("is never under 3 seconds or over 5 minutes", () => {
    expect(aiMusicLengthMs(1_000)).toBe(3_000)
    expect(aiMusicLengthMs(20 * 60_000)).toBe(300_000)
    // 5 minutes at 30 cents a minute.
    expect(aiMusicCostCents(300_000)).toBe(150)
  })
})
