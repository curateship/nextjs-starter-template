import { beforeEach, describe, expect, it, vi } from "vitest"

import { teaserCostCents } from "@/lib/video/ai-estimates"
import { TEASER_NO_VIDEO_MESSAGE } from "@/lib/video/teaser"

/**
 * Scoring the teaser's moments, with the saved video, the stills and Gemini
 * stood in for. Checked: only the video clips are drawn, in one pass, the
 * price is held against the video's limit, scores land on the right
 * moments, and a cancel stops the paid asks.
 */

const state = vi.hoisted(() => ({
  timeline: null as unknown,
  stillsAsked: [] as { timeline: { tracks: { clips: { kind: string }[] }[] }; fromMs: number; toMs: number; everyMs: number }[],
  answers: [] as unknown[],
  asked: [] as unknown[][],
  budgets: [] as number[],
}))

vi.mock("@/server/video/project-spend", () => ({
  requireVideoBudget: async (_user: string, _video: string, cents: number) => {
    state.budgets.push(cents)
    return { id: "v1", projectId: "p1", timeline: state.timeline }
  },
  videoSpendMetadata: () => ({ projectId: "p1", videoId: "v1" }),
}))
vi.mock("@/server/video/render", () => ({
  renderTimelineStills: async (options: (typeof state.stillsAsked)[number]) => {
    state.stillsAsked.push(options)
    const count = Math.ceil((options.toMs - options.fromMs) / options.everyMs)
    return Array.from({ length: count }, (_, index) => new Uint8Array([index]))
  },
}))
vi.mock("@/server/ai/usage", () => ({
  runAiCall: async (_context: unknown, call: () => Promise<{ result: unknown }>) => (await call()).result,
}))
vi.mock("@/server/video/gemini", () => ({
  requireGeminiKey: async () => "key",
  generateJson: async ({ parts }: { parts: unknown[] }) => {
    state.asked.push(parts)
    return { value: state.answers.shift(), inputTokens: 1, outputTokens: 1 }
  },
}))

const { scoreTeaserMoments } = await import("@/server/video/teaser")

beforeEach(() => {
  state.stillsAsked = []
  state.asked = []
  state.budgets = []
  state.timeline = {
    aspect: "9:16",
    tracks: [
      { id: "words", muted: false, clips: [{ id: "t", name: "Hi", kind: "text", text: "Hi", fontId: "inter", startMs: 0, durationMs: 4_000, trimStartMs: 0 }] },
      { id: "walk", muted: false, clips: [{ id: "v", name: "Walk", kind: "video", mediaId: "m", startMs: 1_000, durationMs: 3_000, trimStartMs: 0 }] },
    ],
  }
})

describe("scoring the teaser's moments", () => {
  it("draws only the video, once, and puts each score on its moment", async () => {
    state.answers = [
      { frames: [{ index: 1, score: 30, reason: "dim" }, { index: 3, score: 140, reason: "a view" }] },
    ]
    const scored = await scoreTeaserMoments({ userId: "u", videoId: "v1" })
    expect(state.stillsAsked).toHaveLength(1)
    expect(state.stillsAsked[0].timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.kind))).toEqual(["video"])
    expect(state.asked[0]).toHaveLength(4)
    expect(scored).toEqual([
      { atMs: 1_000, score: 30, reason: "dim" },
      { atMs: 3_000, score: 100, reason: "a view" },
    ])
    expect(state.budgets.at(-1)).toBe(teaserCostCents(3))
  })

  it("asks Gemini nothing once Cancel is pressed", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      scoreTeaserMoments({ userId: "u", videoId: "v1", signal: controller.signal })
    ).rejects.toThrow()
    expect(state.asked).toHaveLength(0)
  })

  it("refuses a video with no video clips", async () => {
    state.timeline = { aspect: "9:16", tracks: [] }
    await expect(scoreTeaserMoments({ userId: "u", videoId: "v1" })).rejects.toThrow(TEASER_NO_VIDEO_MESSAGE)
  })
})
