import { describe, expect, it } from "vitest"

import {
  buildFillerWordSuggestions,
  buildJumpCutSuggestions,
  findSpeechGapRanges,
  parseSilencedetectOutput,
  snapRangesToSilence,
} from "./jump-cuts"

/** The clip starts 5s along the timeline, runs 3s, from 1s into the file. */
const CLIP = { startMs: 5_000, durationMs: 3_000, trimStartMs: 1_000 }

describe("reading the quiet stretches ffmpeg heard", () => {
  it("pairs each start with its end", () => {
    expect(
      parseSilencedetectOutput(`
[silencedetect @ 0x1] silence_start: 1.25
[silencedetect @ 0x1] silence_end: 2.5 | silence_duration: 1.25
[silencedetect @ 0x1] silence_start: 4
[silencedetect @ 0x1] silence_end: 4.75 | silence_duration: 0.75
`)
    ).toEqual([
      { startMs: 1_250, endMs: 2_500 },
      { startMs: 4_000, endMs: 4_750 },
    ])
  })

  it("ignores a stretch that never ends, and anything else in the noise", () => {
    expect(
      parseSilencedetectOutput(`
ffmpeg version 7.0 blah blah
[silencedetect @ 0x1] silence_start: 9
`)
    ).toEqual([])
  })
})

describe("the gaps between words", () => {
  it("finds every gap at least as long as asked for", () => {
    const words = [
      { text: "one", startMs: 0, endMs: 300 },
      // A 900ms gap.
      { text: "two", startMs: 1_200, endMs: 1_500 },
      // A 100ms gap — too short to count.
      { text: "three", startMs: 1_600, endMs: 1_900 },
    ]
    expect(findSpeechGapRanges(words, 500)).toEqual([
      { startMs: 300, endMs: 1_200 },
    ])
  })

  it("is not fooled by words arriving out of order or overlapping", () => {
    const words = [
      { text: "late", startMs: 2_000, endMs: 2_300 },
      { text: "early", startMs: 0, endMs: 1_000 },
      { text: "inside", startMs: 200, endMs: 800 },
    ]
    expect(findSpeechGapRanges(words, 500)).toEqual([
      { startMs: 1_000, endMs: 2_000 },
    ])
  })
})

describe("what to cut for dead air", () => {
  it("leaves a little quiet at each end so speech is never clipped", () => {
    const [cut] = buildJumpCutSuggestions({
      clip: CLIP,
      sensitivity: "balanced",
      words: [],
      silenceRanges: [{ startMs: 1_000, endMs: 2_000 }],
    })
    // 90ms of padding comes off each end of the second of quiet.
    expect(cut.clipStartMs).toBe(1_090)
    expect(cut.clipEndMs).toBe(1_910)
    expect(cut.removedDurationMs).toBe(820)
    // And it says where that is on the timeline, which is what a person sees.
    expect(cut.timelineStartMs).toBe(6_090)
  })

  it("ignores a gap shorter than the setting asks for", () => {
    expect(
      buildJumpCutSuggestions({
        clip: CLIP,
        sensitivity: "gentle",
        words: [],
        // Half a second of quiet: under the 700ms a gentle pass wants.
        silenceRanges: [{ startMs: 1_000, endMs: 1_500 }],
      })
    ).toEqual([])
  })

  it("finds more of them the tighter the setting", () => {
    const silenceRanges = [
      { startMs: 200, endMs: 600 },
      { startMs: 1_000, endMs: 1_800 },
    ]
    const gentle = buildJumpCutSuggestions({
      clip: CLIP,
      sensitivity: "gentle",
      words: [],
      silenceRanges,
    })
    const tight = buildJumpCutSuggestions({
      clip: CLIP,
      sensitivity: "tight",
      words: [],
      silenceRanges,
    })
    expect(tight.length).toBeGreaterThan(gentle.length)
  })

  it("joins two cuts that all but touch into one", () => {
    const cuts = buildJumpCutSuggestions({
      clip: CLIP,
      sensitivity: "tight",
      words: [],
      silenceRanges: [
        // Once the padding comes off these two, only 140ms of sound is left
        // between them — less than a blink, and not worth keeping.
        { startMs: 500, endMs: 1_000 },
        { startMs: 1_020, endMs: 1_600 },
      ],
    })
    expect(cuts).toHaveLength(1)
    expect(cuts[0].clipStartMs).toBe(560)
    expect(cuts[0].clipEndMs).toBe(1_540)
  })

  it("never suggests cuts that overlap each other", () => {
    const cuts = buildJumpCutSuggestions({
      clip: CLIP,
      sensitivity: "tight",
      words: [
        { text: "one", startMs: 0, endMs: 300 },
        { text: "two", startMs: 1_800, endMs: 2_100 },
      ],
      silenceRanges: [{ startMs: 250, endMs: 1_900 }],
    })
    for (let index = 1; index < cuts.length; index += 1) {
      expect(cuts[index].clipStartMs).toBeGreaterThanOrEqual(
        cuts[index - 1].clipEndMs
      )
    }
  })

  it("says how sure it is: heard and read beats one or the other", () => {
    const [both] = buildJumpCutSuggestions({
      clip: CLIP,
      sensitivity: "balanced",
      words: [
        { text: "a", startMs: 0, endMs: 200 },
        { text: "b", startMs: 1_600, endMs: 1_900 },
      ],
      silenceRanges: [{ startMs: 200, endMs: 1_600 }],
    })
    expect(both.confidence).toBe("high")

    const [heardOnly] = buildJumpCutSuggestions({
      clip: CLIP,
      sensitivity: "balanced",
      words: [],
      silenceRanges: [{ startMs: 200, endMs: 1_600 }],
    })
    expect(heardOnly.confidence).toBe("medium")
  })
})

describe("tidying a guessed cut against the quiet that was measured", () => {
  // Speech from 400–700 with quiet either side of it.
  const quiet = [
    { startMs: 0, endMs: 380 },
    { startMs: 720, endMs: 1_200 },
  ]

  it("stretches a cut out to the quiet on both sides", () => {
    // The guess was 60ms late at the start and 40ms early at the end.
    expect(snapRangesToSilence([{ startMs: 460, endMs: 680 }], quiet, 3_000)).toEqual(
      [{ startMs: 380, endMs: 720 }]
    )
  })

  it("leaves a cut alone when the quiet is too far away to be about it", () => {
    const range = { startMs: 2_000, endMs: 2_300 }
    expect(snapRangesToSilence([range], quiet, 3_000)).toEqual([range])
  })

  it("changes nothing when there was no quiet to measure", () => {
    const range = { startMs: 460, endMs: 680 }
    expect(snapRangesToSilence([range], [], 3_000)).toEqual([range])
  })

  it("never reaches past the ends of the clip", () => {
    const [snapped] = snapRangesToSilence(
      [{ startMs: 460, endMs: 680 }],
      quiet,
      500
    )
    expect(snapped.endMs).toBeLessThanOrEqual(500)
  })
})

describe("what to cut for filler words", () => {
  const words = [
    { text: "um", startMs: 400, endMs: 700 },
    { text: "hello", startMs: 800, endMs: 1_200 },
    { text: "uh", startMs: 1_300, endMs: 1_550 },
  ]

  it("uses the measured quiet to fix a word whose timing was guessed short", () => {
    // The "um" really runs 400–700; the guess clipped 60ms off each end.
    const [cut] = buildFillerWordSuggestions({
      clip: CLIP,
      words: [{ text: "um", startMs: 460, endMs: 640 }],
      terms: ["um"],
      silenceRanges: [
        { startMs: 0, endMs: 380 },
        { startMs: 720, endMs: 1_200 },
      ],
    })
    expect(cut.clipStartMs).toBe(380)
    expect(cut.clipEndMs).toBe(720)
  })

  it("gives one cut per word heard, placed on the timeline", () => {
    const cuts = buildFillerWordSuggestions({
      clip: CLIP,
      words,
      terms: ["um", "uh"],
    })
    expect(cuts).toHaveLength(2)
    expect(cuts[0]).toMatchObject({
      clipStartMs: 400,
      clipEndMs: 700,
      timelineStartMs: 5_400,
      removedDurationMs: 300,
    })
    expect(cuts[0].reason).toContain("um")
  })

  it("drops one too brief to leave anything behind", () => {
    expect(
      buildFillerWordSuggestions({
        clip: CLIP,
        words: [{ text: "uh", startMs: 500, endMs: 540 }],
        terms: ["uh"],
      })
    ).toEqual([])
  })
})
