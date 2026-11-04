import { beforeEach, describe, expect, it, vi } from "vitest"

import { BLUR_NOT_FOUND_MESSAGE } from "@/lib/video/blur"

/**
 * Blur that follows something, with the three things outside this file stood
 * in for: the saved video, drawing the stills, and Gemini. What is checked is
 * this file's own work: which lanes are drawn, what is asked, and how the
 * answers become places.
 */

const state = vi.hoisted(() => ({
  timeline: null as unknown,
  stillsAsked: [] as { timeline: { tracks: { id: string }[] }; fromMs: number; toMs: number }[],
  answers: [] as unknown[],
  asked: [] as unknown[][],
  budgets: [] as number[],
}))

vi.mock("@/server/video/project-videos", () => ({
  getOwnedVideo: async () => ({ id: "v1", projectId: "p1", timeline: state.timeline }),
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
    const count = Math.floor((options.toMs - options.fromMs) / 500) + 1
    return Array.from({ length: count }, (_, index) => new Uint8Array([index]))
  },
}))
vi.mock("@/server/ai/usage", () => ({
  runAiCall: async (_context: unknown, call: () => Promise<{ result: unknown }>) =>
    (await call()).result,
}))
vi.mock("@/server/video/gemini", () => ({
  requireGeminiKey: async () => "key",
  generateJson: async ({ parts }: { parts: unknown[] }) => {
    state.asked.push(parts)
    return { value: state.answers.shift(), inputTokens: 1, outputTokens: 1 }
  },
}))

const { findFacesUnderBlur, followUnderBlur } = await import("@/server/video/blur-follow")

function timelineWithBlur(durationMs: number) {
  return {
    aspect: "9:16",
    tracks: [
      { id: "above", muted: false, clips: [{ id: "t", name: "Hi", kind: "text", text: "Hi", fontId: "inter", startMs: 0, durationMs, trimStartMs: 0 }] },
      { id: "blurs", muted: false, clips: [{ id: "b", name: "Blur", kind: "shape", shape: "blur", x: 0.1, y: 0.1, toX: 0.3, toY: 0.3, startMs: 1_000, durationMs, trimStartMs: 0 }] },
      { id: "under", muted: false, clips: [{ id: "v", name: "Clip", kind: "video", mediaId: "m", startMs: 0, durationMs: 5_000, trimStartMs: 0 }] },
    ],
  }
}

beforeEach(() => {
  state.stillsAsked = []
  state.answers = []
  state.asked = []
  state.budgets = []
})

describe("following what is under a blur", () => {
  it("draws only the lanes under the blur, over the blur's own time", async () => {
    state.timeline = timelineWithBlur(1_000)
    state.answers = [{ frames: [{ index: 1, found: true, box_2d: [100, 400, 300, 600] }, { index: 2, found: true, box_2d: [100, 600, 300, 800] }] }]
    await followUnderBlur({ userId: "u", videoId: "v1", clipId: "b", box: { left: 0.1, top: 0.1, width: 0.2, height: 0.2 } })
    expect(state.stillsAsked[0].timeline.tracks.map((track) => track.id)).toEqual(["under"])
    expect(state.stillsAsked[0].fromMs).toBe(1_000)
    expect(state.budgets.at(-1)).toBeGreaterThan(0)
  })

  it("turns each found box into the place of its middle, and skips the frames it lost", async () => {
    state.timeline = timelineWithBlur(1_500)
    state.answers = [
      {
        frames: [
          { index: 1, found: true, box_2d: [100, 400, 300, 600] },
          { index: 2, found: false },
          { index: 3, found: true, box_2d: [100, 700, 300, 900] },
          { index: 9, found: true, box_2d: [0, 0, 10, 10] },
        ],
      },
    ]
    const track = await followUnderBlur({ userId: "u", videoId: "v1", clipId: "b", box: { left: 0.1, top: 0.1, width: 0.2, height: 0.2 } })
    expect(track.map((point) => point.atMs)).toEqual([0, 500, 1_500])
    expect(track[1].x).toBeCloseTo(0.5)
    expect(track[1].y).toBeCloseTo(0.2)
    expect(track[2].x).toBeCloseTo(0.8)
  })

  it("sends the first frame again with every ask, and asks in pieces of 24", async () => {
    state.timeline = timelineWithBlur(15_000)
    state.answers = [{ frames: [] }, { frames: [] }]
    await followUnderBlur({ userId: "u", videoId: "v1", clipId: "b", box: { left: 0.1, top: 0.1, width: 0.2, height: 0.2 } })
    // 31 frames: the first is the reference, then 24 and 6 after it.
    expect(state.asked).toHaveLength(2)
    expect(state.asked[0]).toHaveLength(1 + 1 + 24)
    expect(state.asked[1]).toHaveLength(1 + 1 + 6)
  })

  it("refuses a clip that is not a saved blur", async () => {
    state.timeline = timelineWithBlur(1_000)
    await expect(
      followUnderBlur({ userId: "u", videoId: "v1", clipId: "v", box: { left: 0, top: 0, width: 0.1, height: 0.1 } })
    ).rejects.toThrow(BLUR_NOT_FOUND_MESSAGE)
  })
})

describe("finding faces", () => {
  it("gives back the faces as boxes of the frame and drops empty ones", async () => {
    state.timeline = timelineWithBlur(1_000)
    state.answers = [{ faces: [{ box_2d: [100, 200, 400, 500] }, { box_2d: [10, 10, 10, 10] }] }]
    const faces = await findFacesUnderBlur({ userId: "u", videoId: "v1", clipId: "b" })
    expect(faces).toHaveLength(1)
    expect(faces[0].left).toBeCloseTo(0.2)
    expect(faces[0].height).toBeCloseTo(0.3)
  })
})
