import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  DEFAULT_FILLER_TERMS,
  detectFillerRanges,
  sanitizeFillerTerms,
  type FillerWord,
} from "../lib/filler-words.ts"
import { buildFillerWordSuggestions } from "./jump-cuts.ts"
import {
  createInitialEditorState,
  editorReducer,
} from "../pages/video-editor/editor-store.ts"

describe("detectFillerRanges", () => {
  const words: FillerWord[] = [
    { text: "So,", startMs: 0, endMs: 300 },
    { text: "um,", startMs: 400, endMs: 700 },
    { text: "I", startMs: 800, endMs: 900 },
    { text: "was", startMs: 950, endMs: 1_200 },
    { text: "like", startMs: 1_300, endMs: 1_600 },
    { text: "really", startMs: 1_700, endMs: 2_100 },
    { text: "uh", startMs: 2_200, endMs: 2_450 },
    { text: "happy.", startMs: 2_500, endMs: 3_000 },
  ]

  it("finds each selected filler occurrence and ignores unselected words", () => {
    const ranges = detectFillerRanges(words, ["um", "uh", "like"])
    assert.deepEqual(
      ranges.map((range) => ({ term: range.term, startMs: range.startMs })),
      [
        { term: "um", startMs: 400 },
        { term: "like", startMs: 1_300 },
        { term: "uh", startMs: 2_200 },
      ]
    )
    // "So," is a real word here because "so" was not selected.
    assert.ok(!ranges.some((range) => range.term === "so"))
  })

  it("strips punctuation and casing before matching", () => {
    const ranges = detectFillerRanges(
      [{ text: "Um…", startMs: 0, endMs: 250 }],
      ["um"]
    )
    assert.equal(ranges.length, 1)
    assert.equal(ranges[0].endMs, 250)
  })

  it("matches multi-word phrases and prefers them over single words", () => {
    const phraseWords: FillerWord[] = [
      { text: "you", startMs: 0, endMs: 200 },
      { text: "know", startMs: 250, endMs: 500 },
      { text: "it", startMs: 600, endMs: 750 },
    ]
    const ranges = detectFillerRanges(phraseWords, ["you know"])
    assert.deepEqual(ranges, [
      { startMs: 0, endMs: 500, term: "you know", confidence: "low" },
    ])
  })

  it("returns nothing when no terms are selected", () => {
    assert.deepEqual(detectFillerRanges(words, []), [])
  })

  it("carries per-term confidence so review can flag ambiguous words", () => {
    const [range] = detectFillerRanges(
      [{ text: "um", startMs: 0, endMs: 300 }],
      ["um"]
    )
    assert.equal(range.confidence, "high")
    const [ambiguous] = detectFillerRanges(
      [{ text: "like", startMs: 0, endMs: 300 }],
      ["like"]
    )
    assert.equal(ambiguous.confidence, "low")
  })
})

describe("sanitizeFillerTerms", () => {
  it("keeps only catalog terms, deduped and lowercased", () => {
    assert.deepEqual(
      sanitizeFillerTerms([" UM ", "um", "like", "banana", "UH"]),
      ["um", "like", "uh"]
    )
  })

  it("returns an empty list for undefined input", () => {
    assert.deepEqual(sanitizeFillerTerms(undefined), [])
  })

  it("exposes the classic um / uh / like as the default set", () => {
    assert.deepEqual(DEFAULT_FILLER_TERMS, ["um", "uh", "like"])
  })
})

describe("buildFillerWordSuggestions", () => {
  const clip = { startMs: 5_000, durationMs: 3_000, trimStartMs: 1_000 }
  const words: FillerWord[] = [
    { text: "um", startMs: 400, endMs: 700 },
    { text: "hello", startMs: 800, endMs: 1_200 },
    { text: "uh", startMs: 1_300, endMs: 1_550 },
  ]

  it("maps clip-window word times to clip/source/timeline spans", () => {
    const suggestions = buildFillerWordSuggestions({
      clip,
      words,
      terms: ["um", "uh"],
    })
    assert.equal(suggestions.length, 2)
    const [first] = suggestions
    assert.deepEqual(
      {
        clipStartMs: first.clipStartMs,
        clipEndMs: first.clipEndMs,
        sourceStartMs: first.sourceStartMs,
        timelineStartMs: first.timelineStartMs,
        removedDurationMs: first.removedDurationMs,
      },
      {
        clipStartMs: 400,
        clipEndMs: 700,
        sourceStartMs: 1_400,
        timelineStartMs: 5_400,
        removedDurationMs: 300,
      }
    )
    assert.match(first.reason, /um/)
  })

  it("drops occurrences shorter than a keepable clip", () => {
    const suggestions = buildFillerWordSuggestions({
      clip,
      words: [{ text: "uh", startMs: 500, endMs: 540 }],
      terms: ["uh"],
    })
    assert.deepEqual(suggestions, [])
  })

  it("applies as one undoable edit through the jump-cut reducer", () => {
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
              durationMs: 3_000,
              trimStartMs: 0,
            },
          ],
        },
      ],
    })

    const suggestions = buildFillerWordSuggestions({
      clip: { startMs: 0, durationMs: 3_000, trimStartMs: 0 },
      words,
      terms: ["um", "uh"],
    })

    state = editorReducer(state, {
      type: "APPLY_JUMP_CUTS",
      clipId: "source",
      removals: suggestions.map((suggestion) => ({
        clipStartMs: suggestion.clipStartMs,
        clipEndMs: suggestion.clipEndMs,
      })),
      rippleClipIds: [],
    })

    const remaining = state.tracks[0].clips.reduce(
      (total, clip) => total + clip.durationMs,
      0
    )
    // Removed both fillers: 300ms ("um") + 250ms ("uh") = 550ms.
    assert.equal(remaining, 3_000 - 550)

    state = editorReducer(state, { type: "UNDO" })
    assert.equal(state.tracks[0].clips.length, 1)
    assert.equal(state.tracks[0].clips[0].durationMs, 3_000)
  })
})
