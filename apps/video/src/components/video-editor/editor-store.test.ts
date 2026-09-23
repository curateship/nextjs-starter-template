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

describe("playing a clip faster or slower", () => {
  function speedState(clips: EditorClip[]) {
    return createInitialEditorState({
      aspect: "9:16",
      tracks: [{ id: "footage", muted: false, clips }],
    })
  }

  const eightSecondTake: EditorClip = {
    id: "clip-1",
    kind: "video",
    name: "Talking",
    mediaId: "media-1",
    startMs: 0,
    durationMs: 8_000,
    trimStartMs: 0,
    sourceDurationMs: 8_000,
  }

  it("gives a clip at twice the speed half the timeline room", () => {
    const after = editorReducer(speedState([eightSecondTake]), {
      type: "SET_CLIP_SPEED",
      clipId: "clip-1",
      speed: 2,
    })
    const clip = after.tracks[0].clips[0]
    expect(clip.speed).toBe(2)
    expect(clip.durationMs).toBe(4_000)
  })

  it("keeps the same stretch of recording when the speed changes", () => {
    const after = editorReducer(speedState([eightSecondTake]), {
      type: "SET_CLIP_SPEED",
      clipId: "clip-1",
      speed: 0.5,
    })
    const clip = after.tracks[0].clips[0]
    expect(clip.durationMs * (clip.speed ?? 1)).toBe(8_000)
  })

  it("stores nothing when the speed is put back to normal", () => {
    const sped = editorReducer(speedState([eightSecondTake]), {
      type: "SET_CLIP_SPEED",
      clipId: "clip-1",
      speed: 2,
    })
    const back = editorReducer(sped, {
      type: "SET_CLIP_SPEED",
      clipId: "clip-1",
      speed: 1,
    })
    expect(back.tracks[0].clips[0].speed).toBeUndefined()
    expect(back.tracks[0].clips[0].durationMs).toBe(8_000)
  })

  it("takes only the room up to the next clip when it is slowed down", () => {
    const next: EditorClip = {
      id: "clip-2",
      kind: "video",
      name: "Next",
      mediaId: "media-2",
      startMs: 10_000,
      durationMs: 2_000,
      trimStartMs: 0,
    }
    const after = editorReducer(speedState([eightSecondTake, next]), {
      type: "SET_CLIP_SPEED",
      clipId: "clip-1",
      speed: 0.5,
    })
    // Sixteen seconds is what it wanted; ten is what there was.
    expect(after.tracks[0].clips[0].durationMs).toBe(10_000)
    expect(after.tracks[0].clips[1].startMs).toBe(10_000)
  })

  it("splits a sped-up clip at the right moment of the recording", () => {
    const sped = editorReducer(speedState([eightSecondTake]), {
      type: "SET_CLIP_SPEED",
      clipId: "clip-1",
      speed: 2,
    })
    // The clip now holds 4s of timeline. Cutting 1s in is 2s into the file.
    const after = editorReducer(sped, {
      type: "SPLIT_CLIP",
      clipId: "clip-1",
      atMs: 1_000,
    })
    const [left, right] = after.tracks[0].clips
    expect(left.durationMs).toBe(1_000)
    expect(right.trimStartMs).toBe(2_000)
    expect(right.durationMs).toBe(3_000)
    expect(right.speed).toBe(2)
  })
})

describe("colour on a clip", () => {
  function coloured() {
    let state = START
    for (const patch of [
      { brightness: 0.2 },
      { contrast: 1.1 },
      { saturation: 1.3 },
    ]) {
      state = editorReducer(state, {
        type: "UPDATE_CLIP",
        clipId: "clip-1",
        patch,
      })
    }
    return state
  }
  const clipOf = (state: typeof START) => state.tracks[0].clips[0]

  it("resets all three at once, and one undo brings all three back", () => {
    const before = coloured()
    const reset = editorReducer(before, {
      type: "UPDATE_CLIP",
      clipId: "clip-1",
      patch: {
        brightness: undefined,
        contrast: undefined,
        saturation: undefined,
      },
    })
    expect(clipOf(reset)).toMatchObject({
      brightness: undefined,
      contrast: undefined,
      saturation: undefined,
    })
    const undone = editorReducer(reset, { type: "UNDO" })
    expect(clipOf(undone)).toMatchObject({
      brightness: 0.2,
      contrast: 1.1,
      saturation: 1.3,
    })
  })

  const media = {
    mediaId: "media-2",
    url: "https://example.test/new",
    name: "New",
    sourceDurationMs: 10_000,
  }

  it("keeps the colour when the footage is swapped for a picture", () => {
    const after = editorReducer(coloured(), {
      type: "REPLACE_CLIP_MEDIA",
      clipId: "clip-1",
      media: { ...media, fileType: "image" },
    })
    expect(clipOf(after).brightness).toBe(0.2)
  })

  it("drops the colour when the footage is swapped for sound", () => {
    const after = editorReducer(coloured(), {
      type: "REPLACE_CLIP_MEDIA",
      clipId: "clip-1",
      media: { ...media, fileType: "audio" },
    })
    expect(clipOf(after)).toMatchObject({
      brightness: undefined,
      contrast: undefined,
      saturation: undefined,
    })
  })
})

describe("picking several clips", () => {
  const three = createInitialEditorState({
    aspect: "9:16",
    tracks: [
      {
        id: "words",
        muted: false,
        clips: [caption("a", 0), caption("b", 1_000), caption("c", 2_000)],
      },
    ],
  })

  it("adds a clip with Shift held, and the inspector moves to it", () => {
    let state = editorReducer(three, { type: "SELECT_CLIP", clipId: "a" })
    state = editorReducer(state, {
      type: "SELECT_CLIP",
      clipId: "c",
      additive: true,
    })
    expect(state.selectedClipIds).toEqual(["a", "c"])
    expect(state.selectedClipId).toBe("c")
  })

  it("takes a clip back out when it is clicked again with Shift", () => {
    let state = editorReducer(three, { type: "SELECT_CLIP", clipId: "a" })
    state = editorReducer(state, { type: "SELECT_CLIP", clipId: "c", additive: true })
    state = editorReducer(state, { type: "SELECT_CLIP", clipId: "c", additive: true })
    expect(state.selectedClipIds).toEqual(["a"])
    expect(state.selectedClipId).toBe("a")
  })

  it("drops the group when anything else moves the selection", () => {
    let state = editorReducer(three, { type: "SELECT_CLIP", clipId: "a" })
    state = editorReducer(state, { type: "SELECT_CLIP", clipId: "b", additive: true })
    state = editorReducer(state, { type: "DELETE_CLIP", clipId: "b" })
    expect(state.selectedClipId).toBeNull()
    expect(state.selectedClipIds).toEqual([])
  })
})

describe("pasting copied clips", () => {
  // Three clips with a one-second gap and then a two-second gap between them.
  const copied = [
    { clip: caption("p1", 0), lane: 0 },
    { clip: caption("p2", 1_800), lane: 0 },
    { clip: caption("p3", 4_600), lane: 0 },
  ]
  const empty = createInitialEditorState()

  it("keeps the gaps between the clips, starting at the playhead", () => {
    const after = editorReducer(empty, {
      type: "PASTE_CLIPS",
      clips: copied,
      atMs: 5_000,
    })
    expect(after.tracks[0].clips.map((clip) => clip.startMs)).toEqual([
      5_000, 6_800, 9_600,
    ])
    expect(after.selectedClipIds).toEqual(["p1", "p2", "p3"])
    expect(after.past).toHaveLength(1)
  })

  it("lands on the lane it is aimed at, and lower lanes follow it", () => {
    const after = editorReducer(empty, {
      type: "PASTE_CLIPS",
      clips: [
        { clip: caption("top", 0), lane: 0 },
        { clip: caption("under", 0), lane: 1 },
      ],
      atMs: 0,
      trackId: empty.tracks[1].id,
    })
    expect(after.tracks[1].clips.map((clip) => clip.id)).toEqual(["top"])
    expect(after.tracks[2].clips.map((clip) => clip.id)).toEqual(["under"])
  })

  it("goes onto a new lane whole when one clip would overlap", () => {
    const busy = createInitialEditorState({
      aspect: "9:16",
      tracks: [{ id: "words", muted: false, clips: [caption("in-the-way", 7_000)] }],
    })
    const after = editorReducer(busy, {
      type: "PASTE_CLIPS",
      clips: copied,
      atMs: 5_000,
      trackId: "words",
    })
    expect(after.tracks[0].clips.map((clip) => clip.id)).toEqual(["in-the-way"])
    expect(after.tracks[1].clips.map((clip) => clip.startMs)).toEqual([
      5_000, 6_800, 9_600,
    ])
  })

  it("is refused whole when a lane would pass its clip limit", () => {
    const crowded = createInitialEditorState({
      aspect: "9:16",
      tracks: [
        {
          id: "words",
          muted: false,
          clips: Array.from({ length: 499 }, (_, index) =>
            caption(`c-${index}`, index * 1_000)
          ),
        },
      ],
    })
    const after = editorReducer(crowded, {
      type: "PASTE_CLIPS",
      clips: copied,
      atMs: 600_000,
      trackId: "words",
    })
    expect(after).toBe(crowded)
  })

  it("is refused whole when there is no room for another lane", () => {
    const full = createInitialEditorState({
      aspect: "9:16",
      tracks: Array.from({ length: 50 }, (_, index) => ({
        id: `lane-${index}`,
        muted: false,
        clips: [caption(`c-${index}`, 0)],
      })),
    })
    const after = editorReducer(full, {
      type: "PASTE_CLIPS",
      clips: copied,
      atMs: 0,
    })
    expect(after).toBe(full)
  })
})
