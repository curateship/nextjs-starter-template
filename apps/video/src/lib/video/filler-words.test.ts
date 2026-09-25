import { describe, expect, it } from "vitest"

import {
  DEFAULT_FILLER_TERMS,
  detectFillerRanges,
  sanitizeFillerTerms,
  type FillerWord,
} from "./filler-words"

const SPEECH: FillerWord[] = [
  { text: "So,", startMs: 0, endMs: 300 },
  { text: "um,", startMs: 400, endMs: 700 },
  { text: "I", startMs: 800, endMs: 900 },
  { text: "was", startMs: 950, endMs: 1_200 },
  { text: "like", startMs: 1_300, endMs: 1_600 },
  { text: "really", startMs: 1_700, endMs: 2_100 },
  { text: "uh", startMs: 2_200, endMs: 2_450 },
  { text: "happy.", startMs: 2_500, endMs: 3_000 },
]

describe("finding the words to cut", () => {
  it("finds every one that was asked for, and leaves the rest alone", () => {
    const ranges = detectFillerRanges(SPEECH, ["um", "uh", "like"])
    expect(
      ranges.map((range) => ({ term: range.term, startMs: range.startMs }))
    ).toEqual([
      { term: "um", startMs: 400 },
      { term: "like", startMs: 1_300 },
      { term: "uh", startMs: 2_200 },
    ])
    // "So," is a real word here, because nobody asked for "so".
    expect(ranges.some((range) => range.term === "so")).toBe(false)
  })

  it("ignores capitals and punctuation", () => {
    const ranges = detectFillerRanges(
      [{ text: "Um…", startMs: 0, endMs: 250 }],
      ["um"]
    )
    expect(ranges).toHaveLength(1)
    expect(ranges[0].endMs).toBe(250)
  })

  it("takes a phrase whole rather than as its parts", () => {
    const ranges = detectFillerRanges(
      [
        { text: "you", startMs: 0, endMs: 200 },
        { text: "know", startMs: 250, endMs: 500 },
        { text: "it", startMs: 600, endMs: 750 },
      ],
      ["you know"]
    )
    expect(ranges).toEqual([
      { startMs: 0, endMs: 500, term: "you know", confidence: "low" },
    ])
  })

  it("finds nothing when nothing was asked for", () => {
    expect(detectFillerRanges(SPEECH, [])).toEqual([])
  })

  it("says how sure it is, so the doubtful ones can be flagged", () => {
    expect(
      detectFillerRanges([{ text: "um", startMs: 0, endMs: 300 }], ["um"])[0]
        .confidence
    ).toBe("high")
    expect(
      detectFillerRanges([{ text: "like", startMs: 0, endMs: 300 }], ["like"])[0]
        .confidence
    ).toBe("low")
  })
})

describe("what the browser is allowed to ask for", () => {
  it("keeps only words on the list, once each, in plain lower case", () => {
    expect(sanitizeFillerTerms([" UM ", "um", "like", "banana", "UH"])).toEqual([
      "um",
      "like",
      "uh",
    ])
  })

  it("asks for nothing when it was given nothing", () => {
    expect(sanitizeFillerTerms(undefined)).toEqual([])
  })

  it("starts ticked on the three nobody argues about", () => {
    expect(DEFAULT_FILLER_TERMS).toEqual(["um", "uh", "like"])
  })
})
