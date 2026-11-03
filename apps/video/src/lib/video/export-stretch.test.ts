import { describe, expect, it } from "vitest"

import {
  clockText,
  parseClockText,
  STRETCH_ORDER_MESSAGE,
  STRETCH_PAST_END_MESSAGE,
  STRETCH_TOO_SHORT_MESSAGE,
  stretchRefusal,
  timelineStretch,
} from "@/lib/video/export-stretch"

const MINUTE = 60_000

describe("reading a time typed in the Export window", () => {
  it("takes seconds, minutes and seconds, and hours", () => {
    expect(parseClockText("45")).toBe(45_000)
    expect(parseClockText("10:00")).toBe(10 * MINUTE)
    expect(parseClockText(" 90:30 ")).toBe(90.5 * MINUTE)
    expect(parseClockText("1:05:00")).toBe(65 * MINUTE)
  })

  it("refuses anything that is not a time", () => {
    expect(parseClockText("")).toBeNull()
    expect(parseClockText("ten")).toBeNull()
    expect(parseClockText("10:75")).toBeNull()
    expect(parseClockText("1:2:3:4")).toBeNull()
  })

  it("writes times back the same way", () => {
    expect(clockText(0)).toBe("0:00")
    expect(clockText(12 * MINUTE)).toBe("12:00")
    expect(clockText(65 * MINUTE + 4_000)).toBe("1:05:04")
  })
})

describe("which parts can be exported", () => {
  it("takes any part of at least a second inside the project", () => {
    expect(stretchRefusal(10 * MINUTE, 12 * MINUTE, 45 * MINUTE)).toBeNull()
    // A project of 44:59.4 shows its end as 45:00, and that is allowed.
    expect(stretchRefusal(0, 45 * MINUTE, 45 * MINUTE - 600)).toBeNull()
  })

  it("says why a part cannot be exported", () => {
    expect(stretchRefusal(12 * MINUTE, 10 * MINUTE, 45 * MINUTE)).toBe(STRETCH_ORDER_MESSAGE)
    expect(stretchRefusal(0, 46 * MINUTE, 45 * MINUTE)).toBe(STRETCH_PAST_END_MESSAGE)
    expect(stretchRefusal(10_000, 10_500, 45 * MINUTE)).toBe(STRETCH_TOO_SHORT_MESSAGE)
  })
})

type TestClip = {
  id: string
  startMs: number
  durationMs: number
  trimStartMs: number
  speed?: number
  fadeInMs?: number
  fadeOutMs?: number
  transition?: unknown
  wordTimes?: { startMs: number; endMs: number }[]
}

describe("cutting a part out of the timeline", () => {
  const timeline: { aspect: string; tracks: { id: string; clips: TestClip[] }[] } = {
    aspect: "16:9",
    tracks: [
      {
        id: "footage",
        clips: [
          // Wholly before the part.
          { id: "a", startMs: 0, durationMs: 9 * MINUTE, trimStartMs: 0 },
          // Runs across the start, at twice the speed, with fades both ends.
          {
            id: "b",
            startMs: 9 * MINUTE,
            durationMs: 2 * MINUTE,
            trimStartMs: 1_000,
            speed: 2,
            fadeInMs: 500,
            fadeOutMs: 500,
            transition: { kind: "crossfade", durationMs: 500 },
          },
          // Runs across the end.
          { id: "c", startMs: 11 * MINUTE, durationMs: 3 * MINUTE, trimStartMs: 0, fadeOutMs: 800 },
          // Wholly after.
          { id: "d", startMs: 14 * MINUTE, durationMs: MINUTE, trimStartMs: 0 },
        ],
      },
      {
        id: "words",
        clips: [
          {
            id: "caption",
            startMs: 9 * MINUTE + 50_000,
            durationMs: 20_000,
            trimStartMs: 0,
            wordTimes: [
              { startMs: 0, endMs: 5_000 },
              { startMs: 12_000, endMs: 15_000 },
            ],
          },
        ],
      },
    ],
  }

  const part = timelineStretch(timeline, 10 * MINUTE, 12 * MINUTE)

  it("leaves out what is wholly outside, and starts the file at the part's start", () => {
    expect(part.tracks[0].clips.map((clip) => clip.id)).toEqual(["b", "c"])
    expect(part.tracks[0].clips[0].startMs).toBe(0)
    expect(part.tracks[0].clips[1].startMs).toBe(MINUTE)
  })

  it("cuts a clip under the start like a split: later in the file, no fade or blend in", () => {
    const b = part.tracks[0].clips[0]
    expect(b.durationMs).toBe(MINUTE)
    // A minute of clip at twice the speed is two minutes of file.
    expect(b.trimStartMs).toBe(1_000 + 2 * MINUTE)
    expect(b.fadeInMs).toBeUndefined()
    expect(b.transition).toBeUndefined()
    expect(b.fadeOutMs).toBe(500)
  })

  it("cuts a clip under the end short, without its fade out", () => {
    const c = part.tracks[0].clips[1]
    expect(c.durationMs).toBe(MINUTE)
    expect(c.trimStartMs).toBe(0)
    expect(c.fadeOutMs).toBeUndefined()
  })

  it("keeps a cut caption's words lit at the same moments", () => {
    const caption = part.tracks[1].clips[0]
    expect(caption.startMs).toBe(0)
    expect(caption.durationMs).toBe(10_000)
    expect(caption.wordTimes).toEqual([
      { startMs: -10_000, endMs: -5_000 },
      { startMs: 2_000, endMs: 5_000 },
    ])
  })

  it("is two minutes long, starting at ten minutes in", () => {
    const end = Math.max(
      ...part.tracks.flatMap((track) => track.clips.map((clip) => clip.startMs + clip.durationMs))
    )
    expect(end).toBe(2 * MINUTE)
  })
})
