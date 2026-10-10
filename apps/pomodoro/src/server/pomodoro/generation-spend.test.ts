import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { pomodoroGenerations } from "@/server/pomodoro/schema"
import { customShellAiUsageEvents, customShellMedia } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"

// The providers and FFmpeg are the only fakes: nothing here may reach Google,
// ElevenLabs or a real encoder. The providers module is faked whole, because
// loading the real one inside the fake loads the worker before the fake is
// ready. The models come from `src/lib/pomodoro/generation.ts`, so the meter
// still prices what the providers would really have been asked for.
const fakes = vi.hoisted(() => ({
  background: vi.fn(),
  soundscape: vi.fn(),
  transcode: vi.fn(),
  store: vi.fn(),
}))
vi.mock("@/server/pomodoro/generation-providers", () => ({
  ProviderKeyMissingError: class ProviderKeyMissingError extends Error {},
  generateBackgroundVideo: fakes.background,
  generateSoundscapeAudio: fakes.soundscape,
}))
vi.mock("@/server/pomodoro/media-transcode", async (original) => ({
  ...(await original<typeof import("@/server/pomodoro/media-transcode")>()),
  transcodeUpload: fakes.transcode,
}))
vi.mock("@/server/pomodoro/media-uploads", async (original) => ({
  ...(await original<typeof import("@/server/pomodoro/media-uploads")>()),
  storePomodoroUpload: fakes.store,
}))

import { ProviderKeyMissingError } from "@/server/pomodoro/generation-providers"
import { requestGenerations } from "@/server/pomodoro/generation"
import { processNextGeneration } from "@/server/pomodoro/generation-worker"

/**
 * Every attempt that reaches a provider is one row on the shell's AI usage
 * page, at the provider's real price.
 */

let client: PGlite
let db: CustomShellDb
let userId: string

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  userId = (await insertUser(db)).id
  for (const fake of Object.values(fakes)) fake.mockReset()
  fakes.transcode.mockResolvedValue({
    bytes: new Uint8Array([1]),
    extension: "mp4",
    mimeType: "video/mp4",
  })
  fakes.store.mockImplementation(async () => ({ mediaId: await insertMedia() }))
})

afterEach(async () => {
  await client.close()
})

async function insertMedia() {
  const workspace = await insertWorkspace(db)
  const id = uuid()
  const timestamp = now()
  await db.insert(customShellMedia).values({
    id,
    workspaceId: workspace.id,
    userId,
    filename: `${id}.mp4`,
    originalName: "made.mp4",
    fileSize: 1,
    mimeType: "video/mp4",
    fileType: "video",
    storagePath: `${userId}/${id}.mp4`,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return id
}

async function queue(kind: "background" | "soundscape") {
  const { rows } = await requestGenerations(
    userId,
    [{ kind, prompt: "rain on a window" }],
    { background: 20, soundscape: 20 }
  )
  return rows[0]
}

const rows = () =>
  db.select().from(customShellAiUsageEvents).where(eq(customShellAiUsageEvents.userId, userId))

describe("what a generation costs on the AI usage page", () => {
  it("prices a finished background as 8 seconds of Veo 3.1 Lite, $0.40", async () => {
    const job = await queue("background")
    fakes.background.mockResolvedValue({ bytes: new Uint8Array([1, 2]), kind: "video" })

    await processNextGeneration()

    const [row] = await rows()
    expect(row).toMatchObject({
      provider: "gemini",
      model: "veo-3.1-lite-generate-preview",
      feature: "pomodoro background",
      status: "success",
      costCents: 40,
    })
    expect(row.metadata).toMatchObject({ units: 8, generationId: job.id })
  })

  it("prices a finished soundscape as 30 seconds of ElevenLabs sound, $0.06", async () => {
    await queue("soundscape")
    fakes.soundscape.mockResolvedValue({ bytes: new Uint8Array([1]), kind: "audio" })

    await processNextGeneration()

    const [row] = await rows()
    expect(row).toMatchObject({
      provider: "elevenlabs",
      model: "eleven_text_to_sound_v2",
      feature: "pomodoro soundscape",
      status: "success",
      costCents: 6,
    })
  })

  it("records a provider failure as failed at $0, in this app's words", async () => {
    await queue("background")
    fakes.background.mockRejectedValue(new Error("PROVIDER_TIMEOUT"))

    await processNextGeneration()

    const [row] = await rows()
    expect(row).toMatchObject({ status: "failed", costCents: 0, model: "veo-3.1-lite-generate-preview" })
    expect(row.metadata).toMatchObject({ error: "PROVIDER_TIMEOUT" })
  })

  it("keeps the provider's own words out of the row", async () => {
    await queue("soundscape")
    fakes.soundscape.mockRejectedValue(
      new SyntaxError(`Unexpected token '<', "<html>quota for project 1234" is not valid JSON`)
    )

    await processNextGeneration()

    const [row] = await rows()
    expect(row.metadata).toMatchObject({ error: "PROVIDER_FAILED" })
  })

  it("records nothing when the key is missing, because nothing reached a provider", async () => {
    await queue("soundscape")
    fakes.soundscape.mockRejectedValue(new ProviderKeyMissingError("PROVIDER_KEY_MISSING"))

    await processNextGeneration()

    expect(await rows()).toHaveLength(0)
  })

  it("still counts the cost when the file fails after the provider made it", async () => {
    const job = await queue("background")
    fakes.background.mockResolvedValue({ bytes: new Uint8Array([1]), kind: "video" })
    fakes.transcode.mockRejectedValue(new Error("encoder broke"))

    await processNextGeneration()

    const [row] = await rows()
    expect(row).toMatchObject({ status: "success", costCents: 40 })
    const [generation] = await db.select().from(pomodoroGenerations).where(eq(pomodoroGenerations.id, job.id))
    expect(generation.mediaId).toBeNull()
  })
})
