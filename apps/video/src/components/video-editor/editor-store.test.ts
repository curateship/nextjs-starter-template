import { describe, expect, it } from "vitest"

import {
  createInitialEditorState,
  editorReducer,
  type EditorClip,
} from "./editor-store"

function caption(id: string, startMs: number): EditorClip {
  return {
    id,
    kind: "text",
    name: "Caption",
    text: id,
    fontId: "inter",
    startMs,
    durationMs: 800,
    trimStartMs: 0,
  }
}

const START = createInitialEditorState({
  aspect: "9:16",
  tracks: [
    {
      id: "footage",
      muted: false,
      clips: [
        {
          id: "clip-1",
          kind: "video",
          name: "Talking",
          mediaId: "media-1",
          startMs: 0,
          durationMs: 8_000,
          trimStartMs: 0,
        },
      ],
    },
  ],
})

describe("rewriting the opening line", () => {
  const opening = createInitialEditorState({
    aspect: "9:16",
    tracks: [
      {
        id: "words",
        muted: false,
        clips: [
          { ...caption("a", 0), text: "Stop" },
          { ...caption("b", 900), text: "watching this" },
        ],
      },
    ],
  })

  it("puts the new words across the clips they came from", () => {
    const after = editorReducer(opening, {
      type: "REWRITE_HOOK",
      lines: [
        { clipId: "a", text: "Do not scroll" },
        { clipId: "b", text: "past this" },
      ],
    })
    expect(after.tracks[0].clips.map((clip) => clip.text)).toEqual([
      "Do not scroll",
      "past this",
    ])
    // Where and how long they are is untouched — only the words changed.
    expect(after.tracks[0].clips.map((clip) => clip.startMs)).toEqual([0, 900])
  })

  it("puts the old line back in one press of undo", () => {
    const after = editorReducer(opening, {
      type: "REWRITE_HOOK",
      lines: [{ clipId: "a", text: "Something else" }],
    })
    expect(editorReducer(after, { type: "UNDO" }).tracks).toEqual(
      opening.tracks
    )
  })

  it("quietens only the opening of the footage and lays the new line over it", () => {
    const talking = createInitialEditorState({
      aspect: "9:16",
      tracks: [
        { id: "words", muted: false, clips: [{ ...caption("a", 0), text: "Stop" }] },
        {
          id: "cam",
          muted: false,
          clips: [
            {
              id: "take",
              kind: "video",
              name: "Piece to camera",
              mediaId: "m",
              startMs: 0,
              durationMs: 30_000,
              trimStartMs: 0,
            },
          ],
        },
      ],
    })

    const after = editorReducer(talking, {
      type: "REWRITE_HOOK",
      lines: [{ clipId: "a", text: "Do not scroll" }],
      spoken: {
        how: "quieten",
        clipId: "take",
        untilMs: 2_000,
        voice: {
          id: "newvoice",
          kind: "audio",
          name: "Do not scroll",
          mediaId: "spoken",
          startMs: 0,
          durationMs: 1_800,
          trimStartMs: 0,
        },
      },
    })

    const [opening, rest] = after.tracks[1].clips
    // The take is cut in two: the first two seconds silent, the remainder as
    // it was, still pointing at the right moment of the recording.
    expect(opening).toMatchObject({ durationMs: 2_000, muted: true, trimStartMs: 0 })
    expect(rest).toMatchObject({
      startMs: 2_000,
      durationMs: 28_000,
      trimStartMs: 2_000,
    })
    expect(rest.muted).toBeFalsy()
    // And the new line is on a lane of its own.
    expect(after.tracks.at(-1)?.clips[0].id).toBe("newvoice")
    // One press of undo puts the take back in one piece.
    expect(editorReducer(after, { type: "UNDO" }).tracks).toEqual(talking.tracks)
  })

  it("does nothing when there is nothing to change", () => {
    expect(editorReducer(opening, { type: "REWRITE_HOOK", lines: [] })).toBe(
      opening
    )
  })
})

describe("dropping in a voiceover", () => {
  const audio: EditorClip = {
    id: "voice",
    kind: "audio",
    name: "Voiceover",
    mediaId: "media-voice",
    startMs: 0,
    durationMs: 4_000,
    trimStartMs: 0,
  }

  it("puts the sound at the bottom and its words on top", () => {
    const after = editorReducer(START, {
      type: "INSERT_VOICEOVER",
      audio,
      captions: [caption("b", 1_000), caption("a", 0)],
    })

    expect(after.tracks[0].clips.map((clip) => clip.id)).toEqual(["a", "b"])
    expect(after.tracks.at(-1)?.clips[0].id).toBe("voice")
    // The sound is what you would want to move next, so it is what is picked.
    expect(after.selectedClipId).toBe("voice")
  })

  it("adds no empty lane when there is nothing to say", () => {
    const after = editorReducer(START, {
      type: "INSERT_VOICEOVER",
      audio,
      captions: [],
    })
    expect(after.tracks).toHaveLength(START.tracks.length + 1)
  })

  it("comes off in one press of undo", () => {
    const after = editorReducer(START, {
      type: "INSERT_VOICEOVER",
      audio,
      captions: [caption("a", 0), caption("b", 1_000)],
    })
    expect(editorReducer(after, { type: "UNDO" }).tracks).toEqual(START.tracks)
  })
})

describe("cutting pieces out of a clip", () => {
  const talking = createInitialEditorState({
    aspect: "9:16",
    tracks: [
      {
        id: "track",
        muted: false,
        clips: [
          {
            id: "source",
            kind: "video",
            name: "Talking",
            mediaId: "media-1",
            startMs: 0,
            durationMs: 3_000,
            trimStartMs: 0,
          },
          {
            id: "after",
            kind: "video",
            name: "Next",
            mediaId: "media-2",
            startMs: 3_000,
            durationMs: 1_000,
            trimStartMs: 0,
          },
        ],
      },
    ],
  })

  it("leaves the pieces either side, closed up, still on the right frames", () => {
    const after = editorReducer(talking, {
      type: "APPLY_JUMP_CUTS",
      clipId: "source",
      removals: [{ clipStartMs: 1_000, clipEndMs: 1_500 }],
      rippleClipIds: [],
    })

    const [first, second] = after.tracks[0].clips
    expect(first).toMatchObject({ startMs: 0, durationMs: 1_000, trimStartMs: 0 })
    // The second piece butts up against the first, but still points at the
    // moment of the recording it came from.
    expect(second).toMatchObject({
      startMs: 1_000,
      durationMs: 1_500,
      trimStartMs: 1_500,
    })
  })

  it("shuffles what comes after back by however much was taken out", () => {
    const after = editorReducer(talking, {
      type: "APPLY_JUMP_CUTS",
      clipId: "source",
      removals: [{ clipStartMs: 1_000, clipEndMs: 1_500 }],
      rippleClipIds: ["after"],
    })
    expect(
      after.tracks[0].clips.find((clip) => clip.id === "after")?.startMs
    ).toBe(2_500)
  })

  it("takes several cuts at once, and undoes them all in one press", () => {
    const after = editorReducer(talking, {
      type: "APPLY_JUMP_CUTS",
      clipId: "source",
      removals: [
        { clipStartMs: 400, clipEndMs: 700 },
        { clipStartMs: 1_300, clipEndMs: 1_550 },
      ],
      rippleClipIds: [],
    })
    const kept = after.tracks[0].clips
      .filter((clip) => clip.mediaId === "media-1")
      .reduce((total, clip) => total + clip.durationMs, 0)
    expect(kept).toBe(3_000 - 550)

    const undone = editorReducer(after, { type: "UNDO" })
    expect(
      undone.tracks[0].clips.filter((clip) => clip.mediaId === "media-1")
    ).toHaveLength(1)
  })

  it("ignores cuts too small to matter, and cuts that are not on a clip", () => {
    expect(
      editorReducer(talking, {
        type: "APPLY_JUMP_CUTS",
        clipId: "source",
        removals: [{ clipStartMs: 500, clipEndMs: 540 }],
        rippleClipIds: [],
      })
    ).toBe(talking)

    expect(
      editorReducer(talking, {
        type: "APPLY_JUMP_CUTS",
        clipId: "nothing-here",
        removals: [{ clipStartMs: 0, clipEndMs: 500 }],
        rippleClipIds: [],
      })
    ).toBe(talking)
  })
})

describe("dropping captions onto the timeline", () => {
  it("puts them all on one new lane above everything else", () => {
    const after = editorReducer(START, {
      type: "INSERT_CAPTIONS",
      captions: [caption("b", 2_000), caption("a", 500)],
    })

    expect(after.tracks).toHaveLength(2)
    // Captions belong over the picture, so their lane goes on top.
    expect(after.tracks[0].clips.map((clip) => clip.id)).toEqual(["a", "b"])
    expect(after.tracks[1].id).toBe("footage")
  })

  it("comes off again in one press of undo, however many there were", () => {
    const after = editorReducer(START, {
      type: "INSERT_CAPTIONS",
      captions: [caption("a", 0), caption("b", 1_000), caption("c", 2_000)],
    })
    const undone = editorReducer(after, { type: "UNDO" })

    expect(undone.tracks).toHaveLength(1)
    expect(undone.tracks[0].clips.map((clip) => clip.id)).toEqual(["clip-1"])
  })

  it("does nothing at all when there were no captions", () => {
    const after = editorReducer(START, { type: "INSERT_CAPTIONS", captions: [] })
    expect(after).toBe(START)
  })

  it("leaves nothing selected, so the inspector does not jump", () => {
    const after = editorReducer(
      { ...START, selectedClipId: "clip-1" },
      { type: "INSERT_CAPTIONS", captions: [caption("a", 0)] }
    )
    expect(after.selectedClipId).toBeNull()
  })
})
