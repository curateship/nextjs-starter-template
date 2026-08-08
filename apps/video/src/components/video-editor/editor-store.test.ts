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
