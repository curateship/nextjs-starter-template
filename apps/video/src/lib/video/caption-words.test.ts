import { describe, expect, it } from "vitest"

import {
  alignWordTimes,
  captionClipWordTimes,
  captionWordHighlight,
  litWordAt,
  litWordIndex,
  litWordRuns,
  splitWindowsByLitWord,
} from "./caption-words"

const LINE = { startMs: 1_000, endMs: 2_000, text: "one two, three" }

describe("giving every word of a line its time", () => {
  it("takes the transcriber's times when they match the line word for word", () => {
    expect(
      alignWordTimes(LINE, [
        { text: "one", startMs: 1_000, endMs: 1_200 },
        { text: "two", startMs: 1_300, endMs: 1_500 },
        { text: ",", startMs: 1_500, endMs: 1_550 },
        { text: "three", startMs: 1_600, endMs: 1_900 },
      ])
    ).toEqual([
      { startMs: 1_000, endMs: 1_200 },
      { startMs: 1_300, endMs: 1_550 },
      { startMs: 1_600, endMs: 1_900 },
    ])
  })

  it("shares the line out evenly when the words do not match", () => {
    expect(
      alignWordTimes(LINE, [{ text: "one", startMs: 1_000, endMs: 1_200 }])
    ).toEqual([
      { startMs: 1_000, endMs: 1_333 },
      { startMs: 1_333, endMs: 1_667 },
      { startMs: 1_667, endMs: 2_000 },
    ])
  })

  it("keeps every time inside the line and in order", () => {
    const times = alignWordTimes({ ...LINE, text: "a b" }, [
      { text: "a", startMs: 900, endMs: 1_400 },
      { text: "b", startMs: 1_300, endMs: 2_400 },
    ])
    expect(times).toEqual([
      { startMs: 1_000, endMs: 1_400 },
      { startMs: 1_300, endMs: 2_000 },
    ])
  })

  it("gives an empty line no words", () => {
    expect(alignWordTimes({ ...LINE, text: "  " })).toEqual([])
  })

  it("stores them from the clip's own start", () => {
    expect(
      captionClipWordTimes({
        startMs: 5_000,
        words: [{ startMs: 5_100, endMs: 5_400 }],
      })
    ).toEqual([{ startMs: 100, endMs: 400 }])
    expect(captionClipWordTimes({ startMs: 5_000 })).toBeUndefined()
  })
})

const TIMES = [
  { startMs: 100, endMs: 300 },
  { startMs: 400, endMs: 600 },
  { startMs: 700, endMs: 900 },
]

describe("which word is lit", () => {
  it("is none before the first word and stays on through a pause", () => {
    expect(litWordIndex(TIMES, 50)).toBe(-1)
    expect(litWordIndex(TIMES, 100)).toBe(0)
    expect(litWordIndex(TIMES, 350)).toBe(0)
    expect(litWordIndex(TIMES, 400)).toBe(1)
    expect(litWordIndex(TIMES, 5_000)).toBe(2)
  })

  it("follows the clip after its left edge is trimmed", () => {
    // The clip's first 400 ms were cut off, so the second word is lit the
    // moment it appears.
    const clip = { startMs: 2_000, durationMs: 1_000, trimStartMs: 400 }
    expect(litWordAt(clip, TIMES, 2_000)).toBe(1)
    expect(litWordAt(clip, TIMES, 2_300)).toBe(2)
  })

  it("draws a plain line when the text no longer matches the times", () => {
    const clip = { text: "a b c", wordTimes: TIMES, activeWordColor: "#ff0" }
    expect(captionWordHighlight(clip)?.color).toBe("#ff0")
    expect(captionWordHighlight({ ...clip, text: "a b" })).toBeNull()
    expect(
      captionWordHighlight({ ...clip, activeWordColor: undefined })
    ).toBeNull()
  })
})

describe("the pictures an export draws", () => {
  it("cuts the clip wherever the lit word changes, covering all of it", () => {
    expect(litWordRuns({ durationMs: 1_000, trimStartMs: 0 }, TIMES)).toEqual([
      { fromMs: 0, toMs: 100, index: -1 },
      { fromMs: 100, toMs: 400, index: 0 },
      { fromMs: 400, toMs: 700, index: 1 },
      { fromMs: 700, toMs: 1_000, index: 2 },
    ])
  })

  it("starts on the right word in the second half of a split", () => {
    expect(litWordRuns({ durationMs: 500, trimStartMs: 500 }, TIMES)).toEqual([
      { fromMs: 0, toMs: 200, index: 1 },
      { fromMs: 200, toMs: 500, index: 2 },
    ])
  })

  it("splits an entrance's pictures by the lit word", () => {
    expect(
      splitWindowsByLitWord(
        [
          { fromMs: 0, toMs: 60, progress: 0 },
          { fromMs: 60, toMs: 1_000, progress: 1 },
        ],
        [
          { fromMs: 0, toMs: 400, index: 0 },
          { fromMs: 400, toMs: 1_000, index: 1 },
        ]
      )
    ).toEqual([
      { fromMs: 0, toMs: 60, progress: 0, lit: 0 },
      { fromMs: 60, toMs: 400, progress: 1, lit: 0 },
      { fromMs: 400, toMs: 1_000, progress: 1, lit: 1 },
    ])
  })
})
