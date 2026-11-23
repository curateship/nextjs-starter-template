import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * The AI ad words and the AI sponsor read, with the writer and the voice
 * stood in. What is checked is this file's own work: what the AI is asked,
 * and what lands on the shelf.
 */

const state = vi.hoisted(() => ({
  prompts: [] as string[],
  answer: {} as unknown,
  spoken: [] as { text: string; voiceId: string }[],
  mediaId: "",
}))

vi.mock("@/server/video/writer", () => ({
  askWriter: async ({ prompt }: { prompt: string }) => {
    state.prompts.push(prompt)
    return state.answer
  },
}))
vi.mock("@/server/video/voice", () => ({
  speak: async ({ text, voiceId }: { text: string; voiceId: string }) => {
    state.spoken.push({ text, voiceId })
    return { mediaId: state.mediaId, url: "https://example.com/read.mp3", name: "read", durationMs: 30_000, captions: [] }
  },
}))

const { listAds, makeSponsorRead, writeTextAd } = await import("@/server/video/ads")

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  process.env.CUSTOM_SHELL_R2_PUBLIC_URL = "https://video-media.example.test"
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  const workspaceId = (await insertWorkspace(database, { userId: user.id })).id
  const timestamp = new Date()
  const [media] = await database
    .insert(customShellMedia)
    .values({
      id: uuid(),
      workspaceId,
      userId: user.id,
      filename: "read.mp3",
      originalName: "read.mp3",
      fileSize: 1000,
      mimeType: "audio/mpeg",
      fileType: "audio",
      storagePath: `${user.id}/read.mp3`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  state.mediaId = media.id
  state.prompts = []
  state.spoken = []
})

afterEach(async () => {
  await client.close()
})

describe("AI writes the ad text", () => {
  it("asks for at most 12 words about the product, and hands back the words", async () => {
    state.answer = { text: "  Try Brightly free for 30 days, code TYLER  " }
    const text = await writeTextAd({ userId: user.id, about: "Brightly budgeting app, code TYLER" })
    expect(text).toBe("Try Brightly free for 30 days, code TYLER")
    expect(state.prompts[0]).toContain("At most 12 words")
    expect(state.prompts[0]).toContain("Brightly budgeting app, code TYLER")
  })
})

describe("the AI sponsor read", () => {
  it("writes a read of the length picked, says it in the voice, and keeps it on the shelf", async () => {
    state.answer = { script: "This video is sponsored by Brightly." }
    const shelfId = await makeSponsorRead(
      {
        userId: user.id,
        about: "Brightly budgeting app",
        seconds: 30,
        voiceId: "voice-1",
        voiceName: "Tyler",
        modelId: "eleven_multilingual_v2",
      },
      database
    )
    // 30 seconds at 170 words a minute.
    expect(state.prompts[0]).toContain("30 second sponsor read")
    expect(state.prompts[0]).toContain("about 85 words")
    expect(state.spoken).toEqual([{ text: "This video is sponsored by Brightly.", voiceId: "voice-1" }])
    const [ad] = await listAds(user.id, database)
    expect(ad).toMatchObject({
      id: shelfId,
      kind: "clip",
      name: "Sponsor read, 30 seconds",
      media: { id: state.mediaId, file_type: "audio" },
      read: { script: "This video is sponsored by Brightly.", voice_id: "voice-1", voice_name: "Tyler" },
    })
  })
})
