import type { EditorClip } from "@/components/video-editor/editor-store"
import {
  DEFAULT_BLUR_DURATION_MS,
  DEFAULT_BLUR_STRENGTH,
  newBlurPlacement,
} from "@/lib/video/blur"
import { MIN_CLIP_MS, editorId } from "@/lib/video/timeline-utils"

/**
 * A new blur, as the Graphics panel's Blur button and a clip's "Blur a spot" lay
 * it down (blur.md). It runs 3 seconds, or `room` when that is shorter: from
 * the right-click, the room is what is left of the clip after the playhead,
 * so the blur ends with the clip it was asked for.
 */
export function newBlurClip(room?: number): EditorClip {
  const durationMs =
    room === undefined
      ? DEFAULT_BLUR_DURATION_MS
      : Math.max(MIN_CLIP_MS, Math.min(DEFAULT_BLUR_DURATION_MS, Math.round(room)))
  return {
    id: editorId(),
    kind: "shape",
    name: "Blur",
    shape: "blur",
    blurShape: "box",
    blurStrength: DEFAULT_BLUR_STRENGTH,
    ...newBlurPlacement(),
    trimStartMs: 0,
    startMs: 0,
    durationMs,
  }
}

/**
 * Where a right-click's blur starts and how long it may run: at the playhead
 * when the playhead is on the clip, otherwise at the clip's start.
 */
export function blurOverClip(clip: EditorClip, playheadMs: number) {
  const endMs = clip.startMs + clip.durationMs
  const atMs =
    playheadMs >= clip.startMs && playheadMs < endMs ? playheadMs : clip.startMs
  return { atMs, room: endMs - atMs }
}
