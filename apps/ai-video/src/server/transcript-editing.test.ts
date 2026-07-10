import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getTranscriptWordPlacement,
  mapTranscriptWordSpanToClipRemoval,
  type TranscriptSource,
  type TranscriptWord,
} from "../lib/transcript-editing.ts"
import {
  createInitialEditorState,
  editorReducer,
} from "../pages/video-editor/editor-store.ts"

const source: TranscriptSource = {
  clipId: "source",
  trackId: "track",
  kind: "video",
  mediaId: "media",
  startMs: 5_000,
  durationMs: 8_000,
  trimStartMs: 1_000,
}

const words: TranscriptWord[] = [
  { text: "Cut", startMs: 6_000, endMs: 6_250 },
  { text: "this", startMs: 6_300, endMs: 6_600 },
  { text: "part.", startMs: 6_650, endMs: 7_000 },
]

describe("mapTranscriptWordSpanToClipRemoval", () => {
  it("maps timeline word times to clip-relative removal times", () => {
    const removal = mapTranscriptWordSpanToClipRemoval(words, 0, 2, source, [
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

    assert.deepEqual(removal, {
      clipId: "source",
      removals: [{ clipStartMs: 1_000, clipEndMs: 2_000 }],
      rippleClipIds: [],
    })
  })

  it("maps later deletions onto the current split fragment", () => {
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

    assert.deepEqual(
      mapTranscriptWordSpanToClipRemoval(laterWords, 0, 1, source, tracks),
      {
        clipId: "fragment",
        removals: [{ clipStartMs: 500, clipEndMs: 1_300 }],
        rippleClipIds: ["tail"],
      }
    )
    assert.equal(
      getTranscriptWordPlacement(laterWords[0], source, tracks)
        ?.timelineStartMs,
      7_500
    )
  })

  it("rejects a selection crossing an already removed span", () => {
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

    assert.equal(
      mapTranscriptWordSpanToClipRemoval(
        [
          { text: "left", startMs: 6_500, endMs: 6_800 },
          { text: "right", startMs: 9_200, endMs: 9_500 },
        ],
        0,
        1,
        source,
        tracks
      ),
      null
    )
  })
})

describe("repeated transcript cuts", () => {
  it("shifts later source fragments after an earlier fragment is shortened", () => {
    let state = createInitialEditorState({
      aspect: "9:16",
      tracks: [
        {
          id: "track",
          muted: false,
          clips: [
            {
              id: "source",
              kind: "video",
              name: "Talking clip",
              mediaId: "media",
              startMs: 0,
              durationMs: 8_000,
              trimStartMs: 0,
            },
          ],
        },
      ],
    })

    state = editorReducer(state, {
      type: "APPLY_JUMP_CUTS",
      clipId: "source",
      removals: [{ clipStartMs: 2_000, clipEndMs: 3_000 }],
      rippleClipIds: [],
    })
    const laterFragment = state.tracks[0].clips.find(
      (clip) => clip.id !== "source"
    )
    assert.ok(laterFragment)
    assert.equal(laterFragment.startMs, 2_000)

    state = editorReducer(state, {
      type: "APPLY_JUMP_CUTS",
      clipId: "source",
      removals: [{ clipStartMs: 500, clipEndMs: 1_000 }],
      rippleClipIds: [laterFragment.id],
    })

    assert.equal(
      state.tracks[0].clips.find((clip) => clip.id === laterFragment.id)
        ?.startMs,
      1_500
    )
  })
})
