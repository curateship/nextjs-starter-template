import { describe, expect, it } from "vitest"

import {
  createInitialEditorState,
  editorReducer,
  findClip,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import { copyLook, lookPatchFor } from "@/lib/video/copied-look"

const video = (id: string, startMs: number, extra: Partial<EditorClip> = {}): EditorClip => ({
  id,
  kind: "video",
  name: id,
  mediaId: `m-${id}`,
  startMs,
  durationMs: 4_000,
  trimStartMs: 0,
  ...extra,
})

describe("copy a clip's look", () => {
  it("takes colour, fades, frame, speed and volume, and never the file or place", () => {
    const look = copyLook(video("a", 0, { brightness: 0.2, look: "warm", fadeInMs: 300, fit: "cover", scale: 0.5, x: 0.2, speed: 2, volume: 0.5 }))!
    expect(look.values).toMatchObject({ brightness: 0.2, look: "warm", fadeInMs: 300, fit: "cover", scale: 0.5, volume: 0.5 })
    expect(look.speed).toBe(2)
    expect(look.values).not.toHaveProperty("x")
    expect(look.values).not.toHaveProperty("mediaId")
  })

  it("gives each kind only what it has", () => {
    const look = copyLook(video("a", 0, { brightness: 0.2, volume: 0.5, speed: 2 }))!
    expect(lookPatchFor({ kind: "image" }, look)).toEqual({ patch: expect.not.objectContaining({ volume: 0.5 }), speed: null })
    expect(lookPatchFor({ kind: "audio" }, look)!.patch).not.toHaveProperty("brightness")
    expect(lookPatchFor({ kind: "text" }, look)).toBeNull()
    expect(copyLook({ kind: "shape" })).toBeNull()
  })

  it("pastes onto several clips as one Undo step, speed resizing each", () => {
    let state = createInitialEditorState({
      aspect: "9:16",
      tracks: [
        { id: "t1", muted: false, clips: [video("a", 0, { brightness: 0.3, speed: 2 })] },
        { id: "t2", muted: false, clips: [video("b", 0), video("c", 5_000)] },
      ],
    })
    state = editorReducer(state, { type: "COPY_LOOK", look: copyLook(findClip(state.tracks, "a")!.clip)! })
    state = editorReducer(state, { type: "PASTE_LOOK", clipIds: ["b", "c"] })
    for (const id of ["b", "c"]) {
      const { clip } = findClip(state.tracks, id)!
      expect(clip.brightness).toBe(0.3)
      expect(clip.speed).toBe(2)
      expect(clip.durationMs).toBe(2_000)
    }
    state = editorReducer(state, { type: "UNDO" })
    expect(findClip(state.tracks, "b")!.clip.brightness).toBeUndefined()
    expect(findClip(state.tracks, "c")!.clip.durationMs).toBe(4_000)
  })
})
