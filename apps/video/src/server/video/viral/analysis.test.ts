import { describe, expect, it } from "vitest"

import {
  readStoredBreakdown,
  tidyBreakdown,
} from "@/server/video/viral/analysis"

/**
 * The clamping is what keeps the player honest: the right panel seeks to these
 * numbers, so a segment ending after the video does would jump past the end and
 * a backwards range would seek to nowhere.
 */

describe("tidyBreakdown", () => {
  it("rounds, clamps into the video and puts each list in order", () => {
    const tidied = tidyBreakdown(
      {
        transcript: [
          { startMs: 900.4, endMs: 1800.6, text: "second" },
          { startMs: -50, endMs: 900, text: "first" },
        ],
        segments: [
          { role: "cta", startMs: 1500, endMs: 9_000, summary: "ask" },
          { role: "hook", startMs: 0, endMs: 1500, summary: "hook" },
        ],
        scenes: [{ startMs: 0, endMs: 400.2 }],
      },
      2_000
    )

    expect(tidied.transcript).toEqual([
      { startMs: 0, endMs: 900, text: "first" },
      { startMs: 900, endMs: 1801, text: "second" },
    ])
    // The segment running past the end is pulled back to the video's length.
    expect(tidied.segments.map((one) => one.role)).toEqual(["hook", "cta"])
    expect(tidied.segments[1].endMs).toBe(2_000)
    expect(tidied.scenes).toEqual([{ startMs: 0, endMs: 400 }])
  })

  it("drops a range that ends before it starts, or lasts no time at all", () => {
    const tidied = tidyBreakdown(
      {
        transcript: [{ startMs: 1_000, endMs: 400, text: "backwards" }],
        segments: [{ role: "hook", startMs: 500, endMs: 500, summary: "none" }],
        scenes: [{ startMs: 0, endMs: 100 }],
      },
      5_000
    )
    expect(tidied.transcript).toEqual([])
    expect(tidied.segments).toEqual([])
    expect(tidied.scenes).toHaveLength(1)
  })

  it("leaves the numbers alone when the video's length is unknown", () => {
    const tidied = tidyBreakdown(
      {
        transcript: [],
        segments: [],
        scenes: [{ startMs: 0, endMs: 99_999 }],
      },
      null
    )
    expect(tidied.scenes[0].endMs).toBe(99_999)
  })
})

describe("readStoredBreakdown", () => {
  it("reads a stored breakdown back", () => {
    const stored = {
      transcript: [{ startMs: 0, endMs: 100, text: "hi" }],
      segments: [{ role: "hook", startMs: 0, endMs: 100, summary: "opens" }],
      scenes: [{ startMs: 0, endMs: 100 }],
    }
    expect(readStoredBreakdown(stored)).toEqual(stored)
  })

  it("turns a role it does not know into other, rather than losing the lot", () => {
    const read = readStoredBreakdown({
      transcript: [],
      segments: [{ role: "punchline", startMs: 0, endMs: 10, summary: "x" }],
      scenes: [],
    })
    expect(read?.segments[0].role).toBe("other")
  })

  it("answers null for a row with no breakdown, or a broken one", () => {
    expect(readStoredBreakdown(null)).toBeNull()
    expect(readStoredBreakdown({ transcript: "words" })).toBeNull()
    expect(readStoredBreakdown({})).toBeNull()
  })
})
