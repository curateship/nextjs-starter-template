import { describe, expect, it, vi } from "vitest"

import { DEFAULT_CAPTION_LOOK } from "@/lib/video/caption-look"
import {
  createEditorStore,
  createInitialEditorState,
  editorReducer,
  type EditorClip,
  type EditorTrack,
} from "./editor-store"
import { clipAdTemplate, layAd, placeAds } from "@/lib/video/ads"

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

  it("never goes past the most tracks a save allows", () => {
    const full = createInitialEditorState({
      aspect: "9:16",
      tracks: Array.from({ length: 49 }, (_, index) => ({
        id: `lane-${index}`,
        muted: false,
        clips: [],
      })),
    })
    // The sound and its words need two lanes and only one is left.
    const refused = editorReducer(full, {
      type: "INSERT_VOICEOVER",
      audio,
      captions: [caption("a", 0)],
    })
    expect(refused).toBe(full)
    // The sound alone fits in the last one.
    const soundOnly = editorReducer(full, {
      type: "INSERT_VOICEOVER",
      audio,
      captions: [],
    })
    expect(soundOnly.tracks).toHaveLength(50)
  })

  it("comes off in one press of undo", () => {
    const after = editorReducer(START, {
      type: "INSERT_VOICEOVER",
      audio,
      captions: [caption("a", 0), caption("b", 1_000)],
    })
    expect(editorReducer(after, { type: "UNDO" }).tracks).toEqual(START.tracks)
  })

  it("turns the original down under a translation, and undo turns it back up", () => {
    const after = editorReducer(START, {
      type: "INSERT_VOICEOVER",
      audio,
      captions: [caption("a", 0)],
      quieten: { clipId: "clip-1", volume: 0.2 },
    })
    const original = after.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === "clip-1")
    // Still there, still where it was, only quieter.
    expect(original).toMatchObject({ startMs: 0, durationMs: 8_000, volume: 0.2 })
    expect(editorReducer(after, { type: "UNDO" }).tracks).toEqual(START.tracks)
  })

  it("never turns up a clip that was already quieter", () => {
    const quiet = createInitialEditorState({
      aspect: "9:16",
      tracks: [
        {
          ...START.tracks[0],
          clips: [{ ...START.tracks[0].clips[0], volume: 0.1 }],
        },
      ],
    })
    const after = editorReducer(quiet, {
      type: "INSERT_VOICEOVER",
      audio,
      captions: [],
      quieten: { clipId: "clip-1", volume: 0.2 },
    })
    expect(after.tracks[0].clips[0].volume).toBe(0.1)
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

  it("deletes every picked clip at once, and one undo brings them all back", () => {
    let state = editorReducer(three, { type: "SELECT_CLIP", clipId: "a" })
    state = editorReducer(state, { type: "SELECT_CLIP", clipId: "c", additive: true })
    state = editorReducer(state, { type: "DELETE_CLIPS", clipIds: state.selectedClipIds })
    const left = state.tracks.flatMap((track) => track.clips.map((clip) => clip.id))
    expect(left).toEqual(["b"])
    expect(state.selectedClipId).toBeNull()
    expect(state.selectedClipIds).toEqual([])
    state = editorReducer(state, { type: "UNDO" })
    const back = state.tracks.flatMap((track) => track.clips.map((clip) => clip.id))
    expect(back.sort()).toEqual(["a", "b", "c"])
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

describe("laying music under the project", () => {
  const music = (id: string, startMs: number, fadeOutMs?: number): EditorClip => ({
    id,
    kind: "audio",
    name: "Song",
    mediaId: "song",
    startMs,
    durationMs: 4_000,
    trimStartMs: 0,
    fadeOutMs,
  })

  it("adds one ducked lane at the bottom, and one undo takes it all away", () => {
    const clips = [music("m1", 0), music("m2", 4_000, 2_000)]
    const laid = editorReducer(START, { type: "ADD_MUSIC_TRACK", clips })

    const lane = laid.tracks.at(-1)!
    expect(laid.tracks).toHaveLength(START.tracks.length + 1)
    expect(lane.duck).toBe(true)
    expect(lane.clips.map((clip) => clip.id)).toEqual(["m1", "m2"])
    expect(laid.selectedClipId).toBe("m1")

    const undone = editorReducer(laid, { type: "UNDO" })
    expect(undone.tracks).toEqual(START.tracks)
  })

  it("does nothing with no clips", () => {
    expect(editorReducer(START, { type: "ADD_MUSIC_TRACK", clips: [] })).toBe(
      START
    )
  })

  it("keeps the fade on the end when a faded clip is split", () => {
    const laid = editorReducer(START, {
      type: "ADD_MUSIC_TRACK",
      clips: [music("m1", 0, 2_000)],
    })
    const split = editorReducer(laid, {
      type: "SPLIT_CLIP",
      clipId: "m1",
      atMs: 1_000,
    })
    const [left, right] = split.tracks.at(-1)!.clips
    expect(left.fadeOutMs).toBeUndefined()
    expect(right.fadeOutMs).toBe(2_000)
  })
})

describe("fades when a clip is cut", () => {
  const faded = createInitialEditorState({
    aspect: "9:16",
    tracks: [
      {
        id: "footage",
        muted: false,
        clips: [
          {
            id: "take",
            kind: "video",
            name: "Talking",
            mediaId: "media-1",
            startMs: 0,
            durationMs: 8_000,
            trimStartMs: 0,
            fadeInMs: 3_000,
            fadeOutMs: 1_500,
            pictureFadeInMs: 500,
            pictureFadeOutMs: 1_000,
          },
        ],
      },
    ],
  })
  const fadesOf = (clip: EditorClip) => ({
    fadeInMs: clip.fadeInMs,
    fadeOutMs: clip.fadeOutMs,
    pictureFadeInMs: clip.pictureFadeInMs,
    pictureFadeOutMs: clip.pictureFadeOutMs,
  })

  it("keeps the fades in on the left half and the fades out on the right", () => {
    const split = editorReducer(faded, {
      type: "SPLIT_CLIP",
      clipId: "take",
      atMs: 4_000,
    })
    const [left, right] = split.tracks[0].clips
    expect(fadesOf(left)).toEqual({
      fadeInMs: 3_000,
      fadeOutMs: undefined,
      pictureFadeInMs: 500,
      pictureFadeOutMs: undefined,
    })
    expect(fadesOf(right)).toEqual({
      fadeInMs: undefined,
      fadeOutMs: 1_500,
      pictureFadeInMs: undefined,
      pictureFadeOutMs: 1_000,
    })
  })

  it("puts both fades back on one press of undo", () => {
    const split = editorReducer(faded, {
      type: "SPLIT_CLIP",
      clipId: "take",
      atMs: 4_000,
    })
    expect(editorReducer(split, { type: "UNDO" }).tracks).toEqual(faded.tracks)
  })

  it("fades only the two ends of a take that jump cuts cut into pieces", () => {
    const after = editorReducer(faded, {
      type: "APPLY_JUMP_CUTS",
      clipId: "take",
      removals: [
        { clipStartMs: 2_000, clipEndMs: 2_500 },
        { clipStartMs: 5_000, clipEndMs: 5_500 },
      ],
      rippleClipIds: [],
    })
    const pieces = after.tracks[0].clips
    expect(pieces).toHaveLength(3)
    expect(pieces.map(fadesOf)).toEqual([
      {
        fadeInMs: 3_000,
        fadeOutMs: undefined,
        pictureFadeInMs: 500,
        pictureFadeOutMs: undefined,
      },
      {
        fadeInMs: undefined,
        fadeOutMs: undefined,
        pictureFadeInMs: undefined,
        pictureFadeOutMs: undefined,
      },
      {
        fadeInMs: undefined,
        fadeOutMs: 1_500,
        pictureFadeInMs: undefined,
        pictureFadeOutMs: 1_000,
      },
    ])
  })
})

describe("adding words or a sticker", () => {
  const sticker = (id: string): EditorClip => ({ ...caption(id, 0), text: "🔥" })

  it("goes on a new lane at the top when the footage is under the playhead", () => {
    const after = editorReducer(START, {
      type: "ADD_OVERLAY",
      clip: sticker("s1"),
      atMs: 1_000,
    })
    expect(after.tracks).toHaveLength(2)
    expect(after.tracks[0].clips.map((clip) => clip.id)).toEqual(["s1"])
    expect(after.tracks[0].clips[0].startMs).toBe(1_000)
    expect(after.tracks[1].id).toBe("footage")
    expect(after.selectedClipId).toBe("s1")
  })

  it("reuses a lane above the footage that has room", () => {
    const once = editorReducer(START, {
      type: "ADD_OVERLAY",
      clip: sticker("s1"),
      atMs: 0,
    })
    const twice = editorReducer(once, {
      type: "ADD_OVERLAY",
      clip: sticker("s2"),
      atMs: 5_000,
    })
    expect(twice.tracks).toHaveLength(2)
    expect(twice.tracks[0].clips.map((clip) => clip.id)).toEqual(["s1", "s2"])
  })

  it("never takes an empty lane under the footage", () => {
    const withLaneBelow = {
      ...START,
      tracks: [...START.tracks, { id: "below", muted: false, clips: [] }],
    }
    const after = editorReducer(withLaneBelow, {
      type: "ADD_OVERLAY",
      clip: sticker("s1"),
      atMs: 0,
    })
    expect(after.tracks.map((track) => track.id).slice(1)).toEqual([
      "footage",
      "below",
    ])
    expect(after.tracks[0].clips.map((clip) => clip.id)).toEqual(["s1"])
  })

  it("can go under a lane that only holds sound", () => {
    const soundOnTop = {
      ...START,
      tracks: [
        {
          id: "voice",
          muted: false,
          clips: [
            {
              id: "v1",
              kind: "audio" as const,
              name: "Voice",
              mediaId: "m2",
              startMs: 0,
              durationMs: 8_000,
              trimStartMs: 0,
            },
          ],
        },
        { id: "words", muted: false, clips: [] },
        ...START.tracks,
      ],
    }
    const after = editorReducer(soundOnTop, {
      type: "ADD_OVERLAY",
      clip: sticker("s1"),
      atMs: 0,
    })
    expect(after.tracks).toHaveLength(3)
    expect(after.tracks[1].clips.map((clip) => clip.id)).toEqual(["s1"])
  })
})

describe("swapping a small picture for footage", () => {
  it("puts the clip back to the full frame", () => {
    const picture = createInitialEditorState({
      aspect: "9:16",
      tracks: [
        {
          id: "stickers",
          muted: false,
          clips: [
            {
              id: "logo",
              kind: "image",
              name: "logo.png",
              mediaId: "m1",
              scale: 0.3,
              x: 0.2,
              y: 0.8,
              startMs: 0,
              durationMs: 3_000,
              trimStartMs: 0,
            },
          ],
        },
      ],
    })
    const swapped = (fileType: "image" | "video") =>
      editorReducer(picture, {
        type: "REPLACE_CLIP_MEDIA",
        clipId: "logo",
        media: {
          mediaId: "m2",
          url: "https://example.test/m2",
          name: "new",
          fileType,
          sourceDurationMs: 10_000,
        },
      }).tracks[0].clips[0]
    expect(swapped("image")).toMatchObject({ scale: 0.3, x: 0.2, y: 0.8 })
    const video = swapped("video")
    expect(video.scale).toBeUndefined()
    expect(video.x).toBeUndefined()
    expect(video.y).toBeUndefined()
  })
})

describe("a locked window", () => {
  it("refuses changes to the timeline and says so, but still selects", () => {
    const refused = vi.fn()
    const store = createEditorStore(START, "Reel", refused)
    store.setLock("read-only")

    store.dispatch({ type: "DELETE_CLIP", clipId: "clip-1" })
    store.dispatch({ type: "SET_ASPECT", aspect: "1:1" })
    expect(refused).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().state.tracks).toBe(START.tracks)
    expect(store.getSnapshot().state.aspect).toBe("9:16")

    store.dispatch({ type: "SELECT_CLIP", clipId: "clip-1" })
    expect(store.getSnapshot().state.selectedClipId).toBe("clip-1")
    expect(refused).toHaveBeenCalledTimes(2)
  })

  it("stops costly work before it runs only while locked", () => {
    const refused = vi.fn()
    const store = createEditorStore(START, "Reel", refused)
    expect(store.refuseIfLocked()).toBe(false)
    store.setLock("read-only")
    expect(store.refuseIfLocked()).toBe(true)
    expect(refused).toHaveBeenCalledTimes(1)
  })

  it("lets a clash replace read-only, never the other way round", () => {
    const store = createEditorStore(START, "Reel")
    store.setLock("read-only")
    store.setLock("conflict")
    store.setLock("read-only")
    expect(store.getSnapshot().lock).toBe("conflict")
    expect(store.getSnapshot().saveStatus).toBe("error")
  })
})

describe("restoring a version from History", () => {
  const version = {
    aspect: "16:9" as const,
    tracks: [{ id: "older", muted: false, clips: [caption("then", 0)] }],
  }

  it("puts the version on screen, shape and all, with nothing selected", () => {
    const selected = editorReducer(START, { type: "SELECT_CLIP", clipId: "clip-1" })
    const after = editorReducer(selected, { type: "RESTORE_TIMELINE", timeline: version })
    expect(after.tracks).toEqual(version.tracks)
    expect(after.aspect).toBe("16:9")
    expect(after.selectedClipId).toBeNull()
    expect(after.selectedClipIds).toEqual([])
  })

  it("comes off in one press of undo", () => {
    const after = editorReducer(START, { type: "RESTORE_TIMELINE", timeline: version })
    expect(editorReducer(after, { type: "UNDO" }).tracks).toEqual(START.tracks)
  })

  it("is refused in a read-only window", () => {
    const refused = vi.fn()
    const store = createEditorStore(START, "Reel", refused)
    store.setLock("read-only")
    store.dispatch({ type: "RESTORE_TIMELINE", timeline: version })
    expect(refused).toHaveBeenCalledOnce()
    expect(store.getSnapshot().state.tracks).toEqual(START.tracks)
  })
})

describe("a moving shot landing on its picture", () => {
  const still = createInitialEditorState({
    aspect: "9:16",
    tracks: [
      {
        id: "pictures",
        muted: false,
        clips: [
          {
            id: "seven",
            kind: "image",
            name: "Lighthouse",
            mediaId: "still",
            startMs: 5_000,
            durationMs: 4_000,
            trimStartMs: 0,
            motion: "push-in",
          },
        ],
      },
    ],
  })
  const land = {
    type: "LAND_MOVING_SHOT" as const,
    clipId: "seven",
    clipMediaId: "still",
    pieces: [
      {
        mediaId: "shot",
        url: "https://example.test/shot",
        durationMs: 4_000,
        origin: {
          tool: "animate" as const,
          model: "gemini-omni-1.1-flash",
          prompt: "The lamp turning",
          firstFrameMediaId: "still",
          referenceMediaIds: [],
          extras: [],
          aspectRatio: "9:16" as const,
          quality: "720p" as const,
        },
      },
    ],
  }

  it("swaps the picture in one step, and one Undo brings it back", () => {
    const landed = editorReducer(still, land)
    expect(landed.tracks[0].clips[0]).toMatchObject({ id: "seven", kind: "video", mediaId: "shot" })
    expect(editorReducer(landed, { type: "UNDO" }).tracks).toEqual(still.tracks)
  })

  it("changes nothing when the picture has gone", () => {
    const gone = editorReducer(still, { type: "DELETE_CLIP", clipId: "seven" })
    expect(editorReducer(gone, land)).toBe(gone)
  })
})

describe("making a clip again", () => {
  const voiceOrigin = {
    tool: "voice" as const,
    model: "eleven_multilingual_v2",
    prompt: "Scene four.",
    voice: { id: "rachel", name: "Rachel", speaker: "elevenlabs" as const },
  }
  const spoken = createInitialEditorState({
    aspect: "9:16",
    tracks: [
      { id: "words", muted: false, clips: [{ ...caption("c1", 1_000), spokenBy: "line" }] },
      {
        id: "voices",
        muted: false,
        clips: [
          {
            id: "line",
            kind: "audio",
            name: "Scene four",
            mediaId: "old-sound",
            startMs: 1_000,
            durationMs: 2_000,
            trimStartMs: 0,
            origin: voiceOrigin,
          },
        ],
      },
    ],
  })

  it("swaps a voice line and its captions in one step, and one Undo brings both back", () => {
    const remade = editorReducer(spoken, {
      type: "REMAKE_VOICE_LINE",
      clipId: "line",
      look: DEFAULT_CAPTION_LOOK,
      line: {
        mediaId: "new-sound",
        url: "https://example.test/new.mp3",
        name: "Scene four again",
        durationMs: 2_500,
        captions: [{ startMs: 0, endMs: 2_500, text: "Scene four, again." }],
        origin: { ...voiceOrigin, prompt: "Scene four, again." },
      },
    })
    expect(remade.tracks[1].clips[0]).toMatchObject({ mediaId: "new-sound", durationMs: 2_500 })
    expect(remade.tracks[0].clips.map((clip) => clip.text)).toEqual(["Scene four, again."])
    expect(editorReducer(remade, { type: "UNDO" }).tracks).toEqual(spoken.tracks)
  })

  it("forgets the recipe when a voice line is cut, but not when a picture is", () => {
    const cut = editorReducer(spoken, { type: "SPLIT_CLIP", clipId: "line", atMs: 2_000 })
    expect(cut.tracks[1].clips.map((clip) => clip.origin)).toEqual([undefined, undefined])

    const pictureOrigin = {
      tool: "first-frame" as const,
      model: "gemini-2.5-flash-image",
      prompt: "Mia in a kitchen",
      referenceMediaIds: [],
      actorId: "mia",
      extras: [],
      aspectRatio: "9:16" as const,
    }
    const picture = createInitialEditorState({
      aspect: "9:16",
      tracks: [
        {
          id: "pictures",
          muted: false,
          clips: [
            {
              id: "pic",
              kind: "image",
              name: "Mia",
              mediaId: "frame",
              startMs: 0,
              durationMs: 4_000,
              trimStartMs: 0,
              origin: pictureOrigin,
            },
          ],
        },
      ],
    })
    const halves = editorReducer(picture, { type: "SPLIT_CLIP", clipId: "pic", atMs: 2_000 })
    expect(halves.tracks[0].clips.map((clip) => clip.origin)).toEqual([pictureOrigin, pictureOrigin])
  })

  it("forgets the recipe when the clip is given another file", () => {
    const replaced = editorReducer(spoken, {
      type: "REPLACE_CLIP_MEDIA",
      clipId: "line",
      media: {
        mediaId: "upload",
        url: "https://example.test/upload.mp3",
        name: "upload.mp3",
        fileType: "audio",
        sourceDurationMs: 2_000,
      },
    })
    expect(replaced.tracks[1].clips[0].origin).toBeUndefined()
  })
})

describe("a sticker with its sound", () => {
  const sticker: EditorClip = {
    id: "sub",
    kind: "shape",
    name: "Subscribe button",
    shape: "subscribe",
    startMs: 0,
    durationMs: 3_500,
    trimStartMs: 0,
  }
  const click: EditorClip = {
    id: "click",
    kind: "audio",
    name: "Click (Subscribe)",
    stockSound: "click",
    startMs: 0,
    durationMs: 40,
    trimStartMs: 0,
  }

  it("lays the sound on a lane of its own at the press, with the sticker picked", () => {
    const after = editorReducer(START, {
      type: "ADD_OVERLAY_WITH_SOUND",
      clip: sticker,
      atMs: 2_000,
      sound: click,
      soundAtMs: 3_100,
    })
    const placed = after.tracks.flatMap((track) => track.clips)
    expect(placed.find((clip) => clip.id === "sub")?.startMs).toBe(2_000)
    expect(placed.find((clip) => clip.id === "click")?.startMs).toBe(3_100)
    const soundLane = after.tracks.find((track) => track.clips.some((clip) => clip.id === "click"))
    expect(soundLane?.clips).toHaveLength(1)
    expect(after.selectedClipId).toBe("sub")
  })

  it("comes off with one Undo", () => {
    const after = editorReducer(START, {
      type: "ADD_OVERLAY_WITH_SOUND",
      clip: sticker,
      atMs: 0,
      sound: click,
      soundAtMs: 1_100,
    })
    expect(editorReducer(after, { type: "UNDO" }).tracks).toEqual(START.tracks)
  })
})

describe("a Subscribe click's link to its sticker", () => {
  const withClick = createInitialEditorState({
    aspect: "9:16",
    tracks: [
      {
        id: "stickers",
        muted: false,
        clips: [
          { id: "sub", kind: "shape", name: "Subscribe button", shape: "subscribe", startMs: 0, durationMs: 3_500, trimStartMs: 0 },
        ],
      },
      {
        id: "click-lane",
        muted: false,
        clips: [
          { id: "click", kind: "audio", name: "Click", stockSound: "click", pressFor: "sub", startMs: 1_100, durationMs: 400, trimStartMs: 0 },
        ],
      },
    ],
  })
  const clicks = (state: typeof withClick) =>
    state.tracks.flatMap((track) => track.clips).filter((clip) => clip.kind === "audio")

  it("is not copied to a duplicate", () => {
    const after = editorReducer(withClick, { type: "DUPLICATE_CLIP", clipId: "click" })
    expect(clicks(after).map((clip) => clip.pressFor)).toEqual(["sub", undefined])
  })

  it("stays with the first piece of a split", () => {
    const after = editorReducer(withClick, { type: "SPLIT_CLIP", clipId: "click", atMs: 1_300 })
    expect(clicks(after).map((clip) => clip.pressFor)).toEqual(["sub", undefined])
  })
})

describe("ads on the timeline", () => {
  const MIN = 60_000
  let count = 0
  const newId = () => `ad-id-${++count}`

  function talk(durationMs: number): EditorClip {
    return {
      id: "talk",
      kind: "video",
      name: "Talk",
      mediaId: "talk",
      startMs: 0,
      durationMs,
      trimStartMs: 0,
      sourceDurationMs: 20 * MIN,
    }
  }

  function withAds(mode: "pause" | "over") {
    const base = createInitialEditorState({
      aspect: "9:16",
      tracks: [{ id: "footage", muted: false, clips: [talk(12 * MIN)] }],
    })
    const tracks = placeAds(
      base.tracks,
      clipAdTemplate({
        shelfId: "shelf-1",
        name: "Sponsor",
        mediaId: "sponsor",
        url: "https://example.com/sponsor.mp4",
        fileType: "video",
        durationMs: 30_000,
        mode,
      }),
      3,
      newId
    )
    if (!Array.isArray(tracks)) throw new Error(tracks.refusal)
    return editorReducer(base, { type: "EDIT_ADS", tracks })
  }

  const starts = (tracks: EditorTrack[]) =>
    tracks.flatMap((track) => track.clips.filter((clip) => clip.ad).map((clip) => clip.startMs))

  it("places ads as one undo step", () => {
    const state = withAds("over")
    expect(starts(state.tracks)).toEqual([3 * MIN, 6 * MIN, 9 * MIN])
    expect(starts(editorReducer(state, { type: "UNDO" }).tracks)).toEqual([])
  })

  it("spreads the placed ads again when the video gets shorter, in the same undo step", () => {
    const state = withAds("over")
    const cut = editorReducer(state, {
      type: "UPDATE_CLIP",
      clipId: "talk",
      patch: { durationMs: 11 * MIN },
    })
    expect(starts(cut.tracks)).toEqual([165_000, 330_000, 495_000])
    expect(starts(editorReducer(cut, { type: "UNDO" }).tracks)).toEqual([3 * MIN, 6 * MIN, 9 * MIN])
  })

  it("leaves locked ads where they were after a cut elsewhere, and will not drag them", () => {
    const state = withAds("over")
    const adsLane = state.tracks[0]
    const locked = editorReducer(state, { type: "TOGGLE_TRACK_LOCK", trackId: adsLane.id })
    const cut = editorReducer(locked, {
      type: "UPDATE_CLIP",
      clipId: "talk",
      patch: { durationMs: 11 * MIN },
    })
    expect(starts(cut.tracks)).toEqual([3 * MIN, 6 * MIN, 9 * MIN])
    const dragged = editorReducer(cut, {
      type: "MOVE_CLIP",
      clipId: adsLane.clips[0].id,
      toTrackId: adsLane.id,
      startMs: 2 * MIN,
    })
    expect(dragged).toBe(cut)
  })

  it("closes a pause ad's gap when the ad is deleted", () => {
    const state = withAds("pause")
    const first = state.tracks[0].clips[0]
    const deleted = editorReducer(state, { type: "DELETE_CLIP", clipId: first.id })
    expect(starts(deleted.tracks)).toHaveLength(2)
    // The video is 30 seconds shorter. The other two placed ads stay where
    // they were: the video without its placed ads is the same length.
    const footageEnd = Math.max(
      ...deleted.tracks.filter((track) => !track.ads).flatMap((track) =>
        track.clips.map((clip) => clip.startMs + clip.durationMs)
      )
    )
    expect(footageEnd).toBe(13 * MIN)
  })

  it("keeps other clips off the Ads lane and the Ads lane on top", () => {
    const state = withAds("over")
    const adsLane = state.tracks[0]
    const dropped = editorReducer(state, {
      type: "ADD_CLIP",
      clip: { ...talk(5_000), id: "drop" },
      atMs: 0,
      trackId: adsLane.id,
    })
    expect(dropped.tracks.find((track) => track.ads)?.clips.some((clip) => clip.id === "drop")).toBe(false)
    const captioned = editorReducer(dropped, {
      type: "INSERT_CAPTIONS",
      captions: [caption("words", 0)],
    })
    expect(captioned.tracks[0].ads).toBe(true)
  })
})

describe("pasting onto the Ads lane", () => {
  it("lands on the first lane under it instead", () => {
    const base = createInitialEditorState({
      aspect: "9:16",
      tracks: [
        { id: "ads", muted: false, ads: true, clips: [] },
        { id: "footage", muted: false, clips: [] },
      ],
    })
    const pasted = editorReducer(base, {
      type: "PASTE_CLIPS",
      clips: [{ clip: caption("copy", 0), lane: 0 }],
      atMs: 0,
      trackId: "ads",
    })
    expect(pasted.tracks[0].clips).toHaveLength(0)
    expect(pasted.tracks[1].clips.map((clip) => clip.id)).toEqual(["copy"])
  })
})

describe("dragging and trimming a pause ad", () => {
  const MIN = 60_000
  let count = 0
  const newId = () => `drag-id-${++count}`

  function withOnePauseAd() {
    const base = createInitialEditorState({
      aspect: "9:16",
      tracks: [
        {
          id: "footage",
          muted: false,
          clips: [
            {
              id: "talk",
              kind: "video",
              name: "Talk",
              mediaId: "talk",
              startMs: 0,
              durationMs: 12 * MIN,
              trimStartMs: 0,
              sourceDurationMs: 12 * MIN,
            },
          ],
        },
      ],
    })
    const laid = layAd(
      base.tracks,
      clipAdTemplate({
        shelfId: "shelf-1",
        name: "Sponsor",
        mediaId: "sponsor",
        url: "https://example.com/sponsor.mp4",
        fileType: "video",
        durationMs: 30_000,
      }),
      6 * MIN,
      newId
    )
    if ("refusal" in laid) throw new Error(laid.refusal)
    return { state: editorReducer(base, { type: "EDIT_ADS", tracks: laid.tracks }), adId: laid.clipId }
  }

  const adOf = (tracks: EditorTrack[]) => tracks[0].clips[0]

  it("stays at its cut when dropped 2 seconds to the right, inside its own gap", () => {
    const { state, adId } = withOnePauseAd()
    const moved = editorReducer(state, {
      type: "MOVE_CLIP",
      clipId: adId,
      toTrackId: state.tracks[0].id,
      startMs: 6 * MIN + 2_000,
    })
    expect(adOf(moved.tracks).startMs).toBe(6 * MIN)
  })

  it("lands where the video was when dropped past its end", () => {
    const { state, adId } = withOnePauseAd()
    const moved = editorReducer(state, {
      type: "MOVE_CLIP",
      clipId: adId,
      toTrackId: state.tracks[0].id,
      startMs: 8 * MIN,
    })
    // 8:00 on the timeline was 7:30 of the video, before the ad's 30 seconds.
    expect(adOf(moved.tracks).startMs).toBe(7.5 * MIN)
  })

  it("keeps its place and shrinks its gap when its left edge is trimmed", () => {
    const { state, adId } = withOnePauseAd()
    const trimmed = editorReducer(state, {
      type: "UPDATE_CLIP",
      clipId: adId,
      patch: { startMs: 6 * MIN + 10_000, durationMs: 20_000, trimStartMs: 10_000 },
    })
    expect(adOf(trimmed.tracks)).toMatchObject({ startMs: 6 * MIN, durationMs: 20_000, trimStartMs: 10_000 })
    const footageEnd = Math.max(
      ...trimmed.tracks[1].clips.map((clip) => clip.startMs + clip.durationMs)
    )
    expect(footageEnd).toBe(12 * MIN + 20_000)
  })
})
