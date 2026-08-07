import { z } from "zod"

import { TRANSITION_KINDS } from "./clip-transitions"
import { TEXT_FONT_IDS } from "./text-fonts"

/**
 * What a project's timeline is allowed to be.
 *
 * The timeline is stored as one JSON column, so this schema is the only thing
 * standing between the editor and a saved value nobody can draw. Both ends
 * check it: the browser before it saves, the server before it writes.
 */

// A blend at the seam entering this clip (see clip-transitions.ts). Absent =
// hard cut.
const clipTransitionSchema = z
  .object({
    kind: z.enum(TRANSITION_KINDS),
    durationMs: z.number().positive().finite(),
  })
  .strict()

const clipSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(["video", "audio", "image", "text"]),
    name: z.string().max(255),
    // Where the clip sits on the timeline, and how long it runs for.
    startMs: z.number().nonnegative().finite(),
    durationMs: z.number().nonnegative().finite(),
    // How far into the source file this clip starts — it moves when the left
    // edge is trimmed or the clip is split.
    trimStartMs: z.number().nonnegative().finite(),
    // Media-backed clips. The address is re-derived from the id every time a
    // project is opened, so it is a convenience rather than the truth.
    mediaId: z.string().max(36).optional(),
    url: z.string().max(2048).optional(),
    muted: z.boolean().optional(),
    // How long the whole source file runs, so a trim cannot reach past its end.
    sourceDurationMs: z.number().nonnegative().finite().optional(),
    // Text clips.
    text: z.string().max(5000).optional(),
    fontId: z.enum(TEXT_FONT_IDS).optional(),
    fontSize: z.number().finite().optional(),
    color: z.string().max(32).optional(),
    // A block of colour drawn behind the whole line; unset = no box.
    highlightColor: z.string().max(32).optional(),
    // Where the middle of the text sits on the frame, 0–1 in each direction
    // (0.5/0.5 = dead centre). Set by dragging the text on the preview.
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    transition: clipTransitionSchema.optional(),
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

export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3"] as const
export type AspectRatio = (typeof ASPECT_RATIOS)[number]

export const timelineSchema = z
  .object({
    tracks: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            muted: z.boolean(),
            // When set, this track's audio is lowered under any overlapping
            // audio on other tracks ("duck under voice").
            duck: z.boolean().optional(),
            clips: z.array(clipSchema).max(500),
          })
          .strict()
      )
      .max(50),
    aspect: z.enum(ASPECT_RATIOS),
  })
  .strict()

export type ProjectTimeline = z.infer<typeof timelineSchema>

export const SAVED_TIMELINE_INVALID_MESSAGE =
  "Saved timeline is invalid. Recreate it with the current editor."

// Thrown when a save is based on a version the project has since moved past
// (another tab, or a second window). Shared so the editor can recognise the
// rejection and raise the conflict banner instead of retrying forever.
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

// Reading a stored timeline for the editor: a value the schema refuses opens as
// an empty timeline carrying the reason, so a corrupt project is still openable
// and can be saved back over rather than being a dead end.
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
