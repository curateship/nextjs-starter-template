import { z } from "zod"

import { CAPTION_ANIMATION_IDS } from "./caption-animations.ts"
import { MUSIC_TRACK_IDS } from "./music-library.ts"
import { SOUND_EFFECT_IDS } from "./sound-effects.ts"
import { TEXT_FONT_IDS } from "./text-fonts.ts"

const clipWordSchema = z
  .object({
    text: z.string().max(100),
    startMs: z.number().nonnegative().finite(),
    endMs: z.number().nonnegative().finite(),
  })
  .strict()

const clipSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(["video", "audio", "image", "text"]),
    name: z.string().max(255),
    startMs: z.number().nonnegative().finite(),
    durationMs: z.number().nonnegative().finite(),
    trimStartMs: z.number().nonnegative().finite(),
    mediaId: z.string().max(36).optional(),
    url: z.string().max(2048).optional(),
    muted: z.boolean().optional(),
    soundEffectId: z.enum(SOUND_EFFECT_IDS).optional(),
    // Bundled music bed (public/music); resolved like a sound effect at export.
    musicTrackId: z.enum(MUSIC_TRACK_IDS).optional(),
    sourceDurationMs: z.number().nonnegative().finite().optional(),
    text: z.string().max(5000).optional(),
    fontId: z.enum(TEXT_FONT_IDS).optional(),
    fontSize: z.number().finite().optional(),
    color: z.string().max(32).optional(),
    highlightColor: z.string().max(32).optional(),
    words: z.array(clipWordSchema).max(50).optional(),
    // Entrance animation for the active karaoke word (caption presets).
    // Absent or "none" = static highlight, so old timelines are unaffected.
    animation: z.enum(CAPTION_ANIMATION_IDS).optional(),
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    replaceable: z.boolean().optional(),
    segmentLabel: z.string().max(100).optional(),
  })
  .strict()
  .superRefine((clip, context) => {
    if (clip.kind === "text" && !clip.fontId) {
      context.addIssue({
        code: "custom",
        path: ["fontId"],
        message: "Text clips require a font",
      })
    }
  })

export const timelineSchema = z
  .object({
    tracks: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            muted: z.boolean(),
            // When set, this track's audio is lowered under any overlapping
            // audio on other tracks at export ("duck under voice").
            duck: z.boolean().optional(),
            clips: z.array(clipSchema).max(500),
          })
          .strict()
      )
      .max(50),
    aspect: z.enum(["16:9", "9:16", "1:1", "4:3"]),
  })
  .strict()

export type ProjectTimeline = z.infer<typeof timelineSchema>

export const SAVED_TIMELINE_INVALID_MESSAGE =
  "Saved timeline is invalid. Recreate it with the current editor."

// Thrown when a timeline write is based on a version the project has since
// moved past (another tab, or a server-side writer). Shared so the client can
// recognize the rejection and show the conflict banner.
export const PROJECT_CONFLICT_MESSAGE =
  "This project changed elsewhere — reload to continue"

export function createEmptyTimeline(): ProjectTimeline {
  return { tracks: [], aspect: "9:16" }
}

export function createTimelineSnapshot(
  timeline: ProjectTimeline
): ProjectTimeline {
  return requireCanonicalTimeline({
    tracks: timeline.tracks,
    aspect: timeline.aspect,
  })
}

export function requireCanonicalTimeline(value: unknown): ProjectTimeline {
  const parsed = timelineSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(SAVED_TIMELINE_INVALID_MESSAGE)
  }
  return parsed.data
}

export function parseTimelineForReset(value: unknown): {
  timeline: ProjectTimeline
  error: string | null
} {
  try {
    return {
      timeline: requireCanonicalTimeline(value),
      error: null,
    }
  } catch (error) {
    return {
      timeline: createEmptyTimeline(),
      error:
        error instanceof Error ? error.message : SAVED_TIMELINE_INVALID_MESSAGE,
    }
  }
}
