import {
  projectClipAspect,
  SHOT_LENGTHS,
  type AssetAspectRatio,
  type ShotLengthSeconds,
} from "@/lib/video/asset-factories"
import { clipScale } from "@/lib/video/clip-size"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"

/**
 * Making a picture on the timeline move where it sits: which lengths it can
 * ask for, which shape, and the one rule that swaps the picture for the
 * moving shot. The background worker and an open editor both land a shot
 * with `landMovingShot`, so the timeline comes out the same whichever does it
 * (`workspace/docs/animate-a-still.md`).
 */

type Tracks = ProjectTimeline["tracks"]
type Clip = Tracks[number]["clips"][number]

/** What happened to the picture when its shot arrived. */
export type ClipOutcome = "replaced" | "gone"

const PIECE_MS = 8000
/** The longest picture a shot can cover: four 8 second pieces. */
export const MAX_MOVING_STILL_MS = Math.max(...SHOT_LENGTHS) * 1000

export const MOVING_STILL_TOO_LONG_MESSAGE =
  "Make it move works on pictures up to 32 seconds long. Shorten this one first."
export const MOVING_STILL_NOT_FULL_FRAME_MESSAGE =
  "A moving shot always fills the frame. Set this picture's Size to 100% first."
export const MOVING_STILL_BUSY_MESSAGE =
  "This picture is already being made to move."
export const MOVING_STILL_NOT_FOUND_MESSAGE =
  "That picture is no longer on the timeline."
export const MOVING_STILL_UNREADABLE_MESSAGE =
  "That picture's file could not be read, so it cannot be made to move."

/**
 * The lengths a picture of this length can ask for. Up to 8 seconds that is
 * 4, 6 or 8, at least as long as the picture, and the shot is trimmed back to
 * the picture's length when it lands. A longer picture asks for the shortest
 * run of 8 second pieces that covers it, because a longer run would only be
 * cut off. A picture over 32 seconds gets none.
 */
export function stillShotLengths(clipDurationMs: number): ShotLengthSeconds[] {
  const covering = SHOT_LENGTHS.filter((length) => length * 1000 >= clipDurationMs)
  if (clipDurationMs <= PIECE_MS) {
    return covering.filter((length) => length * 1000 <= PIECE_MS)
  }
  return covering.slice(0, 1)
}

/** Why this clip cannot be made to move, or null when it can. */
export function stillRefusal(clip: Clip): string | null {
  if (clip.durationMs > MAX_MOVING_STILL_MS) return MOVING_STILL_TOO_LONG_MESSAGE
  if (clipScale(clip) < 1) return MOVING_STILL_NOT_FULL_FRAME_MESSAGE
  return null
}

/**
 * The shape a picture's shot is asked for in: the picture's own, as near as
 * the video model gets, so the moving shot sits in the frame the way the
 * picture did. A square picture takes the project's shape, or 9:16.
 */
export function stillShotAspect(
  width: number,
  height: number,
  projectAspect: string
): AssetAspectRatio {
  if (width > height) return "16:9"
  if (height > width) return "9:16"
  return projectClipAspect(projectAspect) ?? "9:16"
}

/** The picture a shot is for, if it is still on the timeline as that picture. */
export function findStill(tracks: Tracks, clipId: string, stillMediaId: string | null) {
  for (const track of tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId)
    if (clip) {
      return clip.kind === "image" && stillMediaId && clip.mediaId === stillMediaId
        ? clip
        : null
    }
  }
  return null
}

/** One finished piece of a moving shot, in the order they play. */
export type MovingPiece = {
  mediaId: string
  /** The address to play it from. The server leaves it out; a project fills it in when it opens. */
  url?: string
  /** How long Google was asked to make it. */
  durationMs: number
}

/**
 * Swaps the picture for its moving shot, on the same lane and in exactly the
 * picture's place and length, so nothing else on the timeline moves.
 *
 * - The first piece keeps the picture's clip id, name, transition and
 *   picture fade in; the last keeps its fade out. Every piece keeps the fit
 *   and the colour.
 * - The slow move goes, because the shot moves on its own, and so does a
 *   speed, because the shot was asked for at the picture's own length.
 * - The shot lands muted: the picture had no sound, so a voice or music
 *   under it is not talked over (Tyler, 19 Oct 2026).
 * - Pieces past the picture's length are left off, and the last one is
 *   trimmed to end where the picture ended.
 *
 * "gone" means the picture was deleted, or swapped for another file, while
 * the shot was being made. The timeline is then left as it was.
 */
export function landMovingShot(
  tracks: Tracks,
  shot: {
    clipId: string
    stillMediaId: string | null
    pieces: MovingPiece[]
    newId: () => string
  }
): { tracks: Tracks; outcome: ClipOutcome } {
  const still = findStill(tracks, shot.clipId, shot.stillMediaId)
  if (!still || !shot.pieces.length) return { tracks, outcome: "gone" }

  const endMs = still.startMs + still.durationMs
  const clips: Clip[] = []
  let atMs = still.startMs
  for (const [index, piece] of shot.pieces.entries()) {
    if (atMs >= endMs) break
    const durationMs = Math.min(piece.durationMs, endMs - atMs)
    clips.push({
      ...still,
      id: index === 0 ? still.id : shot.newId(),
      kind: "video",
      mediaId: piece.mediaId,
      url: piece.url,
      startMs: atMs,
      durationMs,
      trimStartMs: 0,
      sourceDurationMs: piece.durationMs,
      muted: true,
      motion: undefined,
      speed: undefined,
      scale: undefined,
      x: undefined,
      y: undefined,
      transition: index === 0 ? still.transition : undefined,
      pictureFadeInMs: index === 0 ? still.pictureFadeInMs : undefined,
      pictureFadeOutMs: undefined,
    })
    atMs += durationMs
  }
  const last = clips[clips.length - 1]
  last.pictureFadeOutMs = still.pictureFadeOutMs

  return {
    outcome: "replaced",
    tracks: tracks.map((track) =>
      track.clips.some((clip) => clip.id === still.id)
        ? {
            ...track,
            clips: track.clips.flatMap((clip) => (clip.id === still.id ? clips : [clip])),
          }
        : track
    ),
  }
}
