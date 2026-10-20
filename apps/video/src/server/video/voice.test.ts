import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { VOICE_UNTIMED_NOTICE } from "@/lib/video/voice"

/**
 * An OpenAI reading, timed by Whisper afterwards. Nothing here spends money or
 * touches storage: the voice, Whisper, ffmpeg and the library are stubbed,
 * and the sound always runs two seconds.
 */

type Heard = { text: string; startMs: number; endMs: number }

const whisper = vi.hoisted(() => ({
  heard: [] as Heard[] | Error,
  formats: [] as string[],
}))
const metered = vi.hoisted(
  () =>
    [] as {
      model: string
      feature: string
      units?: number
      metadata?: Record<string, unknown>
    }[]
)
const uploads = vi.hoisted(() => [] as string[])

vi.mock("@/server/ai/keys", () => ({ getAiKey: async () => "openai-key" }))
vi.mock("@/server/ai/usage", () => ({
  runAiCall: async (
    context: { model: string; feature: string; metadata?: Record<string, unknown> },
    call: () => Promise<{ result: unknown; usage: { units?: number } }>
  ) => {
    const { result, usage } = await call()
    metered.push({
      model: context.model,
      feature: context.feature,
      units: usage.units,
      metadata: context.metadata,
    })
    return result
  },
}))
vi.mock("@/server/video/whisper", () => ({
  requireOpenAiKey: async () => "openai-key",
  transcribeWithWhisper: async ({ format }: { format: string }) => {
    whisper.formats.push(format)
    if (whisper.heard instanceof Error) throw whisper.heard
    return { text: "", words: whisper.heard }
  },
}))
vi.mock("@/server/video/ffmpeg", () => ({
  runFfmpeg: async () => "size=N/A time=00:00:02.00 bitrate=N/A",
}))
vi.mock("@/server/media/storage", () => ({
  uploadToR2: async (storagePath: string) => {
    uploads.push(storagePath)
  },
  deleteFromR2: async () => undefined,
  getPublicMediaUrl: async (storagePath: string) => `https://media.test/${storagePath}`,
}))
vi.mock("@/server/video/voiceovers", () => ({ storeVoiceover: async () => undefined }))
vi.mock("@/server/workspaces/for-request", () => ({
  workspaceIdForRequest: async () => "workspace-1",
}))
vi.mock("@/server/db", () => ({ db: {} }))

import { speak } from "@/server/video/voice"

function read() {
  return speak({
    userId: "user-1",
    voiceId: "alloy",
    voiceName: "Alloy",
    modelId: "eleven_multilingual_v2",
    text: "We are going to win.",
    projectId: "project-1",
  })
}

beforeEach(() => {
  whisper.formats.length = 0
  metered.length = 0
  uploads.length = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
  )
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("an OpenAI reading", () => {
  it("lights each word when Whisper heard it said", async () => {
    // Whisper heard "gonna" for "going to": the two share the gap.
    whisper.heard = [
      { text: "We", startMs: 100, endMs: 250 },
      { text: "are", startMs: 300, endMs: 450 },
      { text: "gonna", startMs: 500, endMs: 800 },
      { text: "win", startMs: 900, endMs: 1_300 },
    ]
    const said = await read()

    expect(said.notice).toBeUndefined()
    expect(whisper.formats).toEqual(["mp3"])
    expect(said.captions.map((line) => line.text)).toEqual(["We are going to", "win."])
    expect(said.captions.flatMap((line) => line.words)).toEqual([
      { startMs: 100, endMs: 250 },
      { startMs: 300, endMs: 450 },
      { startMs: 450, endMs: 675 },
      { startMs: 675, endMs: 900 },
      { startMs: 900, endMs: 1_300 },
    ])
  })

  it("puts the reading and Whisper's minutes on the meter under one feature", async () => {
    whisper.heard = [{ text: "We", startMs: 0, endMs: 100 }]
    await read()

    expect(metered).toEqual([
      expect.objectContaining({ model: "gpt-4o-mini-tts", feature: "voiceover", units: 20 }),
      {
        model: "whisper-1",
        feature: "voiceover",
        units: 2_000 / 60_000,
        metadata: { projectId: "project-1", timing: "gpt-4o-mini-tts" },
      },
    ])
  })

  it("keeps the sound and shares the captions out evenly when Whisper fails", async () => {
    whisper.heard = new Error("Timing the voiceover's words failed (HTTP 401)")
    const said = await read()

    expect(uploads).toHaveLength(1)
    expect(said.mediaId).toBeTruthy()
    expect(said.durationMs).toBe(2_000)
    expect(said.notice).toBe(VOICE_UNTIMED_NOTICE)
    // Five words over two seconds, 400 milliseconds each.
    expect(said.captions.flatMap((line) => line.words)).toEqual([
      { startMs: 0, endMs: 400 },
      { startMs: 400, endMs: 800 },
      { startMs: 800, endMs: 1_200 },
      { startMs: 1_200, endMs: 1_600 },
      { startMs: 1_600, endMs: 2_000 },
    ])
  })

  it("says so when Whisper heard no words at all", async () => {
    whisper.heard = []
    const said = await read()
    expect(said.notice).toBe(VOICE_UNTIMED_NOTICE)
    expect(said.captions.flatMap((line) => line.words)).toHaveLength(5)
  })
})
