import { describe, expect, it } from "vitest"

import {
  createInitialEditorState,
  editorReducer,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import {
  layTeaser,
  planTeaser,
  teaserBeats,
  teaserCountRange,
  teaserCutLengths,
  teaserMusic,
  teaserStillGrid,
} from "@/lib/video/teaser"

const walk: EditorClip = { id: "walk", kind: "video", name: "Walk", mediaId: "w", startMs: 0, durationMs: 60_000, trimStartMs: 5_000 }
const song: EditorClip = { id: "song", kind: "audio", name: "Song", mediaId: "s", startMs: 0, durationMs: 60_000, trimStartMs: 0 }
const caption: EditorClip = { id: "cap", kind: "text", name: "Cap", text: "Hi", fontId: "inter", startMs: 1_000, durationMs: 1_000, trimStartMs: 0 }
const tracks = [
  { id: "v", muted: false, clips: [walk] },
  { id: "t", muted: false, clips: [caption] },
  { id: "m", muted: false, clips: [song] },
]

let ids = 0
const makeId = () => `n${++ids}`

describe("the teaser at the start", () => {
  it("draws a still a second along the video, at most 300", () => {
    expect(teaserStillGrid(tracks)).toMatchObject({ stepMs: 1000, endMs: 60_000 })
    expect(teaserStillGrid(tracks).times).toHaveLength(60)
    const long = [{ id: "v", muted: false, clips: [{ ...walk, durationMs: 3_600_000 }] }]
    expect(teaserStillGrid(long).times.length).toBeLessThanOrEqual(300)
  })

  it("cuts every 2 seconds without music, and on the beats with it", () => {
    expect(teaserCutLengths(10_000, null)).toEqual([2000, 2000, 2000, 2000, 2000])
    expect(teaserCutLengths(5_500, null)).toEqual([2000, 2000, 1500])
    expect(teaserCutLengths(4_500, null)).toEqual([2000, 2500])
    const beats = [500, 1000, 1500, 1750, 2500, 3200, 4600, 6000, 7400, 8800]
    const lengths = teaserCutLengths(10_000, beats)
    expect(lengths.reduce((a, b) => a + b, 0)).toBe(10_000)
    expect(lengths.slice(0, 3)).toEqual([1750, 1450, 1400])
    for (const length of lengths) {
      expect(length).toBeGreaterThanOrEqual(1000)
      expect(length).toBeLessThanOrEqual(3000)
    }
  })

  it("shares the teaser out evenly when you pick how many moments", () => {
    expect(teaserCountRange(10_000)).toEqual({ min: 4, max: 10 })
    expect(teaserCutLengths(10_000, null, 4)).toEqual([2500, 2500, 2500, 2500])
    expect(teaserCutLengths(7_000, null, 3)).toEqual([2333, 2334, 2333])
    expect(teaserCutLengths(10_000, null, 10)).toEqual(Array(10).fill(1000))
  })

  it("lands a picked count on the beats, never outside 1 to 3 seconds", () => {
    const beats = Array.from({ length: 40 }, (_, index) => index * 700)
    const lengths = teaserCutLengths(10_000, beats, 5)
    expect(lengths).toHaveLength(5)
    expect(lengths.reduce((sum, ms) => sum + ms, 0)).toBe(10_000)
    for (const ms of lengths) expect(ms >= 1000 && ms <= 3000).toBe(true)
    // Every cut but the last ends on a beat.
    let at = 0
    for (const ms of lengths.slice(0, -1)) {
      at += ms
      expect(beats).toContain(at)
    }
  })

  it("puts short moments closer together than long ones", () => {
    const scored = [
      { atMs: 10_000, score: 90, reason: "" },
      { atMs: 11_200, score: 80, reason: "" },
    ]
    expect(planTeaser(tracks, scored, [1000, 1000])).toHaveLength(2)
    expect(planTeaser(tracks, scored, [2000, 2000])).toHaveLength(1)
  })

  it("takes the best moments that don't overlap, in the order they happen", () => {
    const scored = [
      { atMs: 40_000, score: 90, reason: "" },
      { atMs: 41_000, score: 85, reason: "" },
      { atMs: 10_000, score: 80, reason: "" },
      { atMs: 25_000, score: 20, reason: "" },
    ]
    expect(planTeaser(tracks, scored, [2000, 2000])).toEqual([
      { clipId: "walk", offsetMs: 9_000, durationMs: 2000 },
      { clipId: "walk", offsetMs: 39_000, durationMs: 2000 },
    ])
  })

  it("follows the beats of the opening of the music already on the video", () => {
    const music = teaserMusic(tracks, new Map([["s", [1000, 2000]]]))
    expect(music?.id).toBe("song")
    expect(teaserBeats({ ...song, trimStartMs: 500 }, [1000, 2000, 99_000], 10_000)).toEqual([500, 1500])
  })

  it("moves everything along, lays the moments first, and mutes them under the music", () => {
    const moments = [
      { clipId: "walk", offsetMs: 9_000, durationMs: 2000 },
      { clipId: "walk", offsetMs: 39_000, durationMs: 3000 },
    ]
    const laid = layTeaser(tracks, [{ id: "p", atMs: 4000, name: "Hi" }], moments, "song", makeId)
    const [cuts, video, words, music, under] = laid.tracks
    expect(cuts.clips.map((clip) => [clip.startMs, clip.durationMs, clip.trimStartMs, clip.muted])).toEqual([
      [0, 2000, 14_000, true],
      [2000, 3000, 44_000, true],
    ])
    expect(video.clips[0].startMs).toBe(5000)
    expect(words.clips[0].startMs).toBe(6000)
    expect(music.clips[0].startMs).toBe(5000)
    expect(under.clips[0]).toMatchObject({ mediaId: "s", startMs: 0, durationMs: 5000, trimStartMs: 0 })
    expect(laid.markers[0].atMs).toBe(9000)
  })

  it("is one Undo step in the editor", () => {
    let state = createInitialEditorState({ aspect: "9:16", tracks })
    state = editorReducer(state, {
      type: "TEASER_AT_START",
      moments: [{ clipId: "walk", offsetMs: 0, durationMs: 2000 }],
      musicClipId: null,
    })
    expect(state.tracks).toHaveLength(4)
    expect(state.tracks[0].clips[0].muted).toBeUndefined()
    state = editorReducer(state, { type: "UNDO" })
    expect(state.tracks).toEqual(tracks)
  })
})
