import { describe, expect, it } from "vitest"

import { findHook, spokenHookLine, spreadHookAcross } from "./hooks"

const TRACKS = [
  {
    clips: [
      { id: "b", kind: "text", text: "watching this", startMs: 1_200, durationMs: 800 },
      { id: "a", kind: "text", text: "Stop", startMs: 0, durationMs: 800 },
      // Well past the opening — part of the video, not its hook.
      { id: "late", kind: "text", text: "Subscribe", startMs: 9_000, durationMs: 800 },
    ],
  },
  {
    clips: [
      { id: "footage", kind: "video", startMs: 0, durationMs: 10_000 },
    ],
  },
]

describe("finding the line a video opens with", () => {
  it("reads every word on screen in the first few seconds, in order", () => {
    expect(findHook(TRACKS)).toEqual({
      clipIds: ["a", "b"],
      text: "Stop watching this",
      spokenBy: null,
    })
  })

  it("has nothing to work with when the opening is silent", () => {
    expect(findHook([{ clips: [{ id: "v", kind: "video", startMs: 0, durationMs: 5_000 }] }])).toBeNull()
    expect(findHook([])).toBeNull()
  })

  it("ignores an empty caption sitting at the start", () => {
    expect(
      findHook([{ clips: [{ id: "blank", kind: "text", text: "   ", startMs: 0, durationMs: 800 }] }])
    ).toBeNull()
  })
})

describe("what is talking over the opening", () => {
  const words = {
    clips: [{ id: "t", kind: "text", text: "Stop", startMs: 0, durationMs: 800 }],
  }

  it("takes a voice clip of its own when there is one", () => {
    expect(
      findHook([
        words,
        { clips: [{ id: "vo", kind: "audio", mediaId: "m", startMs: 0, durationMs: 3_000 }] },
      ])?.spokenBy
    ).toEqual({ clipId: "vo", kind: "audio", startMs: 0, durationMs: 3_000 })
  })

  it("takes the footage itself, which is how a piece to camera talks", () => {
    expect(
      findHook([
        words,
        { clips: [{ id: "cam", kind: "video", mediaId: "m", startMs: 0, durationMs: 30_000 }] },
      ])?.spokenBy
    ).toEqual({ clipId: "cam", kind: "video", startMs: 0, durationMs: 30_000 })
  })

  it("hears nothing through a muted clip or a muted lane", () => {
    expect(
      findHook([
        words,
        { clips: [{ id: "cam", kind: "video", mediaId: "m", muted: true, startMs: 0, durationMs: 9_000 }] },
      ])?.spokenBy
    ).toBeNull()
    expect(
      findHook([
        words,
        { muted: true, clips: [{ id: "cam", kind: "video", mediaId: "m", startMs: 0, durationMs: 9_000 }] },
      ])?.spokenBy
    ).toBeNull()
  })

  it("passes over a bed of music for the footage underneath it", () => {
    expect(
      findHook([
        words,
        { clips: [{ id: "bed", kind: "audio", mediaId: "m", startMs: 0, durationMs: 90_000 }] },
        { clips: [{ id: "cam", kind: "video", mediaId: "m2", startMs: 0, durationMs: 30_000 }] },
      ])?.spokenBy?.clipId
    ).toBe("cam")
  })

  it("still finds the voice when nothing is written on screen", () => {
    const hook = findHook([
      { clips: [{ id: "cam", kind: "video", mediaId: "m", startMs: 0, durationMs: 30_000 }] },
    ])
    // No words to show, but something to listen to — which is the caller's cue
    // to go and hear what was said.
    expect(hook).toEqual({
      clipIds: [],
      text: "",
      spokenBy: { clipId: "cam", kind: "video", startMs: 0, durationMs: 30_000 },
    })
  })

  it("says nothing is spoken when the opening is only pictures and words", () => {
    expect(
      findHook([
        words,
        { clips: [{ id: "still", kind: "image", mediaId: "m", startMs: 0, durationMs: 4_000 }] },
      ])?.spokenBy
    ).toBeNull()
  })
})

describe("the opening line as it was said", () => {
  it("stops at the end of the first sentence", () => {
    expect(
      spokenHookLine([
        { text: "Stop", endMs: 300 },
        { text: "scrolling.", endMs: 900 },
        { text: "Today", endMs: 1_200 },
        { text: "we", endMs: 1_400 },
      ])
    ).toEqual({ text: "Stop scrolling.", endsMs: 900 })
  })

  it("takes a breath's worth when nobody pauses", () => {
    const words = Array.from({ length: 40 }, (_, index) => ({
      text: `word${index}`,
      endMs: (index + 1) * 200,
    }))
    const line = spokenHookLine(words)
    expect(line?.text.split(" ")).toHaveLength(14)
    expect(line?.endsMs).toBe(2_800)
  })

  it("has no line when nothing was said", () => {
    expect(spokenHookLine([])).toBeNull()
    expect(spokenHookLine([{ text: "   ", endMs: 100 }])).toBeNull()
  })
})

describe("putting a rewritten line back", () => {
  it("shares the words out across the clips it came from", () => {
    expect(spreadHookAcross(["a", "b"], "Do not scroll past this")).toEqual([
      { clipId: "a", text: "Do not scroll" },
      { clipId: "b", text: "past this" },
    ])
  })

  it("puts a whole line on a single clip", () => {
    expect(spreadHookAcross(["only"], "  Stop scrolling  ")).toEqual([
      { clipId: "only", text: "Stop scrolling" },
    ])
  })

  it("changes nothing when there is nothing to say or nowhere to say it", () => {
    expect(spreadHookAcross([], "words")).toEqual([])
    expect(spreadHookAcross(["a"], "   ")).toEqual([])
  })
})
