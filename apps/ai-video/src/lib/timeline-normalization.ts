import { DEFAULT_TEXT_FONT_ID } from "@/lib/text-fonts"
import type {
  AspectRatio,
  EditorTrack,
} from "@/pages/video-editor/editor-store"

export type TimelineWithTextFonts = {
  tracks: EditorTrack[]
  aspect: AspectRatio
}

export function normalizeTimelineTextFonts<T extends TimelineWithTextFonts>(
  timeline: T
): T {
  let changed = false
  const tracks = timeline.tracks.map((track) => {
    let trackChanged = false
    const clips = track.clips.map((clip) => {
      if (clip.kind !== "text" || clip.fontId) return clip

      changed = true
      trackChanged = true
      return { ...clip, fontId: DEFAULT_TEXT_FONT_ID }
    })

    return trackChanged ? { ...track, clips } : track
  })

  return changed ? ({ ...timeline, tracks } as T) : timeline
}
