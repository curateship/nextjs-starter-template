import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  encodeWav,
  RECORDED_VOICE_ID,
  RECORDING_NO_KEY_NOTICE,
  RECORDING_SAMPLE_RATE,
  RECORDING_UNREADABLE_MESSAGE,
  RECORDING_UNTIMED_NOTICE,
} from "@/lib/video/recorded-voiceover"

/**
 * Keeping a recorded voiceover. Whisper, the key store, storage and the shelf
 * are stubbed, so nothing here spends money or needs ffmpeg.
 */

type Heard = { text: string; startMs: number; endMs: number }

const state = vi.hoisted(() => ({
  key: "openai-key" as string | null,
  heard: { text: "", words: [] as Heard[] } as { text: string; words: Heard[] } | Error,
  metered: [] as { model: string; feature: string; units?: number }[],
  uploads: [] as { path: string; type: string }[],
  shelf: [] as { media: { mimeType: string }; voiceover: Record<string, unknown> }[],
}))

vi.mock("@/server/ai/keys", () => ({ getAiKey: async () => state.key }))
vi.mock("@/server/ai/usage", () => ({
  runAiCall: async (
    context: { model: string; feature: string },
    call: () => Promise<{ result: unknown; usage: { units?: number } }>
  ) => {
    const { result, usage } = await call()
    state.metered.push({ model: context.model, feature: context.feature, units: usage.units })
    return result
  },
}))
vi.mock("@/server/video/whisper", () => ({
  requireOpenAiKey: async () => "openai-key",
  transcribeWithWhisper: async () => {
    if (state.heard instanceof Error) throw state.heard
    return state.heard
  },
}))
vi.mock("@/server/video/ffmpeg", () => ({
  runFfmpeg: async () => {
    throw new Error("ffmpeg is not installed")
  },
}))
vi.mock("@/server/media/storage", () => ({
  uploadToR2: async (path: string, _bytes: Uint8Array, type: string) => {
    state.uploads.push({ path, type })
  },
  deleteFromR2: async () => undefined,
  getPublicMediaUrl: async (path: string) => `https://media.test/${path}`,
}))
vi.mock("@/server/video/voiceovers", () => ({
  storeVoiceover: async (media: { mimeType: string }, voiceover: Record<string, unknown>) => {
    state.shelf.push({ media, voiceover })
  },
}))
vi.mock("@/server/workspaces/for-request", () => ({
  workspaceIdForRequest: async () => "workspace-1",
}))
vi.mock("@/server/db", () => ({ db: {} }))

import { keepRecordedVoiceover } from "@/server/video/recorded-voiceovers"

/** Three seconds of silence, as the browser sends it. */
const threeSeconds = () =>
  encodeWav(new Float32Array(RECORDING_SAMPLE_RATE * 3), RECORDING_SAMPLE_RATE)

function keep(bytes = threeSeconds()) {
  return keepRecordedVoiceover({
    userId: "user-1",
    bytes,
    spend: { projectId: "project-1", videoId: "video-1" },
  })
}

beforeEach(() => {
  state.key = "openai-key"
  state.heard = {
    text: "Bread goes stale fast.",
    words: [
      { text: "Bread", startMs: 100, endMs: 500 },
      { text: "goes", startMs: 500, endMs: 900 },
      { text: "stale", startMs: 900, endMs: 1_400 },
      { text: "fast", startMs: 1_400, endMs: 2_000 },
    ],
  }
  state.metered = []
  state.uploads = []
  state.shelf = []
})

describe("keepRecordedVoiceover", () => {
  it("keeps the WAV with Whisper's words as captions, without ffmpeg", async () => {
    const kept = await keep()

    expect(kept.durationMs).toBe(3_000)
    expect(kept.notice).toBeUndefined()
    expect(kept.captions.map((line) => line.text).join(" ")).toBe("Bread goes stale fast.")
    expect(kept.captions[0].startMs).toBe(100)
    expect(state.uploads).toEqual([
      { path: expect.stringMatching(/^user-1\/.+-recording\.wav$/), type: "audio/wav" },
    ])
    expect(state.shelf[0].media.mimeType).toBe("audio/wav")
    expect(state.shelf[0].voiceover).toMatchObject({
      script: "Bread goes stale fast.",
      voiceId: RECORDED_VOICE_ID,
      durationMs: 3_000,
    })
    // Whisper's three seconds, filed under the recording's own name.
    expect(state.metered).toEqual([
      { model: "whisper-1", feature: "voiceover_recording", units: 3_000 / 60_000 },
    ])
  })

  it("keeps the recording without captions when there is no OpenAI key", async () => {
    state.key = null
    const kept = await keep()
    expect(kept.captions).toEqual([])
    expect(kept.notice).toBe(RECORDING_NO_KEY_NOTICE)
    expect(state.uploads).toHaveLength(1)
    expect(state.metered).toEqual([])
  })

  it("keeps the recording without captions when Whisper fails", async () => {
    state.heard = new Error("Writing down the recording failed (HTTP 500)")
    const kept = await keep()
    expect(kept.captions).toEqual([])
    expect(kept.notice).toBe(RECORDING_UNTIMED_NOTICE)
    expect(state.uploads).toHaveLength(1)
  })

  it("refuses a file that is not the WAV the window sends, keeping nothing", async () => {
    await expect(keep(new TextEncoder().encode("hello there"))).rejects.toThrow(
      RECORDING_UNREADABLE_MESSAGE
    )
    expect(state.uploads).toEqual([])
    expect(state.metered).toEqual([])
  })
})
