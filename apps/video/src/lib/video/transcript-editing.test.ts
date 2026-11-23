import { describe, expect, it } from "vitest"

import {
  getTranscriptWordPlacement,
  mapTranscriptWordSpanToClipRemoval,
  type TranscriptSource,
  type TranscriptWord,
} from "./transcript-editing"

/**
 * The clip that was transcribed: it starts 5 seconds into the timeline, runs
 * for 8, and begins 1 second into the original recording.
 */
const SOURCE: TranscriptSource = {
  clipId: "source",
  trackId: "track",
  kind: "video",
  mediaId: "media",
  startMs: 5_000,
  durationMs: 8_000,
  trimStartMs: 1_000,
}

const WORDS: TranscriptWord[] = [
  { text: "Cut", startMs: 6_000, endMs: 6_250 },
  { text: "this", startMs: 6_300, endMs: 6_600 },
  { text: "part.", startMs: 6_650, endMs: 7_000 },
]

describe("crossing words out", () => {
  it("turns timeline times into a piece of the clip to remove", () => {
    const removal = mapTranscriptWordSpanToClipRemoval(WORDS, 0, 2, SOURCE, [
      {
        id: "track",
        clips: [
          {
            id: "source",
            kind: "video",
            mediaId: "media",
            startMs: 5_000,
            durationMs: 8_000,
            trimStartMs: 1_000,
          },
        ],
      },
    ])

    // The words run from 1 to 2 seconds into the clip itself.
    expect(removal).toEqual({
      clipId: "source",
      removals: [{ clipStartMs: 1_000, clipEndMs: 2_000 }],
      rippleClipIds: [],
    })
  })

  it("follows the words into the piece they ended up in after earlier cuts", () => {
    const laterWords = [
      { text: "Keep", startMs: 8_500, endMs: 8_800 },
      { text: "cutting", startMs: 8_850, endMs: 9_300 },
    ]
    const tracks = [
      {
        id: "track",
        clips: [
          {
            id: "source",
            kind: "video",
            mediaId: "media",
            startMs: 5_000,
            durationMs: 2_000,
            trimStartMs: 1_000,
          },
          {
            id: "fragment",
            kind: "video",
            mediaId: "media",
            startMs: 7_000,
            durationMs: 2_000,
            trimStartMs: 4_000,
          },
          {
            id: "tail",
            kind: "video",
            mediaId: "media",
            startMs: 9_000,
            durationMs: 2_000,
            trimStartMs: 7_000,
          },
        ],
      },
    ]

    expect(
      mapTranscriptWordSpanToClipRemoval(laterWords, 0, 1, SOURCE, tracks)
    ).toEqual({
      clipId: "fragment",
      removals: [{ clipStartMs: 500, clipEndMs: 1_300 }],
      // What comes after has to shuffle back once this is cut out.
      rippleClipIds: ["tail"],
    })

    expect(
      getTranscriptWordPlacement(laterWords[0], SOURCE, tracks)?.timelineStartMs
    ).toBe(7_500)
  })

  it("refuses a selection that runs across a piece already cut away", () => {
    const tracks = [
      {
        id: "track",
        clips: [
          {
            id: "left",
            kind: "video",
            mediaId: "media",
            startMs: 5_000,
            durationMs: 2_000,
            trimStartMs: 1_000,
          },
          {
            id: "right",
            kind: "video",
            mediaId: "media",
            startMs: 7_000,
            durationMs: 4_000,
            trimStartMs: 5_000,
          },
        ],
      },
    ]

    // There is no single piece holding both ends, so there is nothing safe to
    // remove — saying so beats cutting the wrong thing.
    expect(
      mapTranscriptWordSpanToClipRemoval(
        [
          { text: "left", startMs: 6_500, endMs: 6_800 },
          { text: "right", startMs: 9_200, endMs: 9_500 },
        ],
        0,
        1,
        SOURCE,
        tracks
      )
    ).toBeNull()
  })

  it("has nothing to say about words that are no longer anywhere", () => {
    expect(
      getTranscriptWordPlacement(WORDS[0], SOURCE, [{ id: "track", clips: [] }])
    ).toBeNull()
  })
})
