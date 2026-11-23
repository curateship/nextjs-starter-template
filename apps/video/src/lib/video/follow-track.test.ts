import { describe, expect, it } from "vitest"

import {
  createInitialEditorState,
  editorReducer,
  findClip,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import {
  canFollow,
  followBoxOf,
  followOffsetAt,
  followOffsetExpressions,
  followTranslateCss,
  isFollowing,
  splitFollow,
} from "@/lib/video/follow-track"

const track = [
  { atMs: 0, x: 0.3, y: 0.5 },
  { atMs: 1000, x: 0.5, y: 0.5 },
  { atMs: 2000, x: 0.5, y: 0.7 },
]

const label = (extra: Partial<EditorClip> = {}): EditorClip => ({
  id: "t",
  kind: "text",
  name: "Label",
  text: "Him",
  fontId: "inter",
  startMs: 0,
  durationMs: 2000,
  trimStartMs: 0,
  x: 0.3,
  y: 0.3,
  followTrack: track,
  ...extra,
})

describe("stick to a moving thing", () => {
  it("is for text, shapes and small pictures, never a blur or a full-frame clip", () => {
    expect(canFollow(label())).toBe(true)
    expect(canFollow({ kind: "shape", shape: "arrow", durationMs: 1 })).toBe(true)
    expect(canFollow({ kind: "shape", shape: "blur", durationMs: 1 })).toBe(false)
    expect(canFollow({ kind: "video", durationMs: 1 })).toBe(false)
    expect(canFollow({ kind: "image", scale: 0.3, durationMs: 1 })).toBe(true)
    expect(canFollow({ kind: "audio", durationMs: 1 })).toBe(false)
  })

  it("moves by however far the thing has moved since the first place", () => {
    expect(followOffsetAt(label(), 0)).toEqual({ x: 0, y: 0 })
    const half = followOffsetAt(label(), 500)
    expect(half.x).toBeCloseTo(0.1)
    expect(half.y).toBeCloseTo(0)
    const end = followOffsetAt(label(), 2000)
    expect(end.x).toBeCloseTo(0.2)
    expect(end.y).toBeCloseTo(0.2)
    expect(followTranslateCss(label(), 2000, { width: 1000, height: 500 })).toBe("translate(200px, 100px)")
    expect(followTranslateCss(label({ followTrack: undefined }), 2000, { width: 1000, height: 500 })).toBe("")
  })

  it("writes the export's moves in pixels of the frame from the same places", () => {
    const moved = followOffsetExpressions(label(), { width: 1080, height: 1920 }, 3)
    expect(moved.x).toContain("if(lt(t,4.000)")
    expect(moved.x).toContain("216")
    expect(followOffsetExpressions(label({ followTrack: undefined }), { width: 1080, height: 1920 }, 3)).toEqual({ x: "0", y: "0" })
  })

  it("looks for what is under an arrow's tip", () => {
    const box = followBoxOf({ kind: "shape", shape: "arrow", x: 0.1, y: 0.1, toX: 0.6, toY: 0.4, durationMs: 1 })
    expect(box.left + box.width / 2).toBeCloseTo(0.6)
    expect(box.top + box.height / 2).toBeCloseTo(0.4)
  })

  it("splits without either piece jumping", () => {
    const { left, right } = splitFollow(label(), 1000)
    expect(left.followTrack).toEqual(track.slice(0, 2))
    expect(right.followTrack).toEqual([
      { atMs: 0, x: 0.5, y: 0.5 },
      { atMs: 1000, x: 0.5, y: 0.7 },
    ])
    expect(right.x).toBeCloseTo(0.5)
    const after = { ...label(), ...right, startMs: 1000, durationMs: 1000 }
    expect(isFollowing(after)).toBe(true)
    expect(followOffsetAt(after, 1000).y).toBeCloseTo(0.2)
  })

  it("splits that way on the timeline too", () => {
    let state = createInitialEditorState({ aspect: "9:16", tracks: [{ id: "a", muted: false, clips: [label()] }] })
    state = editorReducer(state, { type: "SPLIT_CLIP", clipId: "t", atMs: 1000 })
    const pieces = state.tracks[0].clips
    expect(pieces).toHaveLength(2)
    expect(findClip(state.tracks, pieces[1].id)!.clip.x).toBeCloseTo(0.5)
  })
})
