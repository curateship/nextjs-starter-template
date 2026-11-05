import { describe, expect, it } from "vitest"

import {
  createInitialEditorState,
  editorReducer,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import {
  FIX_WORD_NOT_SOUND_MESSAGE,
  FIX_WORD_TOO_LONG_MESSAGE,
  fixSpokenWords,
  fixWordCostCents,
} from "@/lib/video/fix-a-word"

const talk: EditorClip = {
  id: "talk",
  kind: "video",
  name: "Talk",
  mediaId: "m",
  startMs: 0,
  durationMs: 10_000,
  trimStartMs: 1_000,
}
const caption: EditorClip = {
  id: "cap",
  kind: "text",
  name: "Caption",
  text: "See you on Tuesday then",
  fontId: "inter",
  startMs: 3_000,
  durationMs: 3_000,
  trimStartMs: 0,
  wordTimes: [
    { startMs: 0, endMs: 300 },
    { startMs: 300, endMs: 600 },
    { startMs: 600, endMs: 900 },
    { startMs: 1_000, endMs: 1_500 },
    { startMs: 1_600, endMs: 2_000 },
  ],
}
const later: EditorClip = { ...caption, id: "later", text: "Bye", startMs: 7_000, durationMs: 1_000, wordTimes: undefined }

let ids = 0
const makeId = () => `new-${++ids}`
const words = { mediaId: "fixed", url: "https://media.test/fixed.mp3", name: "Fixed - Thursday", durationMs: 800 }

function fix(extra: Partial<Parameters<typeof fixSpokenWords>[2]> = {}) {
  return fixSpokenWords(
    [
      { id: "picture", muted: false, clips: [talk] },
      { id: "words", muted: false, clips: [caption, later] },
    ],
    [{ id: "pin", atMs: 8_000, name: "End" }],
    { clipId: "talk", clipStartMs: 4_000, clipEndMs: 4_500, oldText: "Tuesday", newText: "Thursday", words, makeId, ...extra }
  )
}

describe("fix a word you said wrong", () => {
  it("cuts the clip in three, silences the middle and lays the new words under it", () => {
    const fixed = fix()
    if ("refusal" in fixed) throw new Error(fixed.refusal)
    const [left, middle, right] = fixed.tracks[0].clips
    expect(left).toMatchObject({ startMs: 0, durationMs: 4_000, trimStartMs: 1_000, fadeOutMs: 40 })
    expect(middle).toMatchObject({ startMs: 4_000, durationMs: 800, trimStartMs: 5_000, muted: true, speed: 0.625 })
    expect(right).toMatchObject({ startMs: 4_800, durationMs: 5_500, trimStartMs: 5_500, fadeInMs: 40 })
    const sound = fixed.tracks.at(-1)!.clips[0]
    expect(sound).toMatchObject({ kind: "audio", mediaId: "fixed", startMs: 4_000, durationMs: 800 })
  })

  it("moves everything after the old words along, and says the new word in the caption", () => {
    const fixed = fix()
    if ("refusal" in fixed) throw new Error(fixed.refusal)
    const [cap, moved] = fixed.tracks[1].clips
    expect(cap.text).toBe("See you on Thursday then")
    expect(cap.durationMs).toBe(3_300)
    expect(cap.wordTimes![3]).toEqual({ startMs: 1_000, endMs: 1_800 })
    expect(cap.wordTimes![4]).toEqual({ startMs: 1_900, endMs: 2_300 })
    expect(moved.startMs).toBe(7_300)
    expect(fixed.markers).toEqual([{ id: "pin", atMs: 8_300, name: "End" }])
  })

  it("refuses a picture, and new words far longer than the old", () => {
    expect(fix({ clipId: "cap" })).toEqual({ refusal: FIX_WORD_NOT_SOUND_MESSAGE })
    expect(fix({ words: { ...words, durationMs: 5_000 } })).toEqual({ refusal: FIX_WORD_TOO_LONG_MESSAGE })
  })

  it("is one Undo step in the editor", () => {
    let state = createInitialEditorState({ aspect: "9:16", tracks: [{ id: "picture", muted: false, clips: [talk] }] })
    state = editorReducer(state, {
      type: "FIX_SPOKEN_WORDS",
      clipId: "talk",
      clipStartMs: 4_000,
      clipEndMs: 4_500,
      oldText: "Tuesday",
      newText: "Thursday",
      words,
    })
    expect(state.tracks[0].clips).toHaveLength(3)
    state = editorReducer(state, { type: "UNDO" })
    expect(state.tracks[0].clips).toEqual([talk])
    expect(state.tracks).toHaveLength(1)
  })

  it("prices by the characters said", () => {
    expect(fixWordCostCents("Thursday")).toBeGreaterThan(0)
  })
})
