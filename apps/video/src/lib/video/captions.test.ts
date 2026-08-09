import { describe, expect, it } from "vitest"

import { captionClipName, mapCaptionsToTimeline } from "./captions"

/**
 * The clip being captioned starts 5 seconds along the timeline, runs for 4,
 * and begins 2 seconds into the recording. So a word heard 2.5 seconds into
 * the recording belongs at 5.5 seconds on the timeline.
 */
const SOURCE = { startMs: 5_000, durationMs: 4_000, trimStartMs: 2_000 }

describe("putting the captions where the words were said", () => {
  it("shifts them by where the clip starts and how far it is trimmed", () => {
    expect(
      mapCaptionsToTimeline(
        [
          { startMs: 2_000, endMs: 2_800, text: "Hello there" },
          { startMs: 3_000, endMs: 3_900, text: "second bit" },
        ],
        SOURCE
      )
    ).toEqual([
      { startMs: 5_000, endMs: 5_800, text: "Hello there" },
      { startMs: 6_000, endMs: 6_900, text: "second bit" },
    ])
  })

  it("puts them in order however they arrive", () => {
    const mapped = mapCaptionsToTimeline(
      [
        { startMs: 3_000, endMs: 3_500, text: "second" },
        { startMs: 2_000, endMs: 2_500, text: "first" },
      ],
      SOURCE
    )
    expect(mapped.map((line) => line.text)).toEqual(["first", "second"])
  })

  it("never lets one caption run into the next", () => {
    const mapped = mapCaptionsToTimeline(
      [
        { startMs: 2_000, endMs: 3_000, text: "one" },
        // Starts before the previous one has finished.
        { startMs: 2_500, endMs: 3_400, text: "two" },
      ],
      SOURCE
    )
    expect(mapped).toEqual([
      { startMs: 5_000, endMs: 6_000, text: "one" },
      { startMs: 6_000, endMs: 6_400, text: "two" },
    ])
  })

  it("keeps them inside the clip they came from", () => {
    const mapped = mapCaptionsToTimeline(
      [
        // Would end a second past the end of the clip.
        { startMs: 5_000, endMs: 7_000, text: "runs over" },
      ],
      SOURCE
    )
    expect(mapped).toEqual([
      { startMs: 8_000, endMs: 9_000, text: "runs over" },
    ])
  })

  it("drops anything with nothing in it, or no time to be seen in", () => {
    expect(
      mapCaptionsToTimeline(
        [
          { startMs: 2_000, endMs: 2_500, text: "   " },
          { startMs: 3_000, endMs: 3_000, text: "no length" },
          // Entirely past the end of the clip.
          { startMs: 9_000, endMs: 9_500, text: "too late" },
        ],
        SOURCE
      )
    ).toEqual([])
  })
})

describe("what a caption clip is called", () => {
  it("uses the words themselves, shortened when they are long", () => {
    expect(captionClipName("Hello there")).toBe("Hello there")
    expect(captionClipName("  spaced out  ")).toBe("spaced out")
    expect(
      captionClipName("a very long caption line that keeps on going")
    ).toBe("a very long caption lin…")
  })

  it("still has a name when there are no words", () => {
    expect(captionClipName("")).toBe("Caption")
  })
})
