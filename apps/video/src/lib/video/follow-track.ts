import { z } from "zod"

import {
  isBlurClip,
  linearOverTime,
  MAX_BLUR_TRACK_POINTS,
  trackCentreAt,
  type BlurTrackPoint,
  type ShareBox,
} from "./blur"
import { isPlacedPicture } from "./clip-size"

/**
 * Stick to a moving thing (`workspace/docs/stick-to-a-moving-thing.md`):
 * text, an arrow or circle, a sticker, or a small video moving with a person
 * or object under it. Tyler, 4 Nov 2026, picked all four.
 *
 * `followTrack` is the followed thing's middle, one place every half second
 * from the clip's start, found the same way a blur's is (blur-follow.ts).
 * The item keeps the distance it had from the thing when following began:
 * it is drawn where it was placed, moved by however far the thing has moved
 * since the first place. So a label set above a head stays above it, and
 * dragging the item afterwards moves it and keeps it following.
 */

export const followPointSchema = z
  .object({
    atMs: z.number().finite().min(0),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict()

export const MAX_FOLLOW_POINTS = MAX_BLUR_TRACK_POINTS

export const FOLLOW_ITEM_NOT_FOUND_MESSAGE =
  "That item is gone from the timeline, or can't follow anything."

type FollowClip = Parameters<typeof isPlacedPicture>[0] & {
  kind: string
  shape?: string
  socialPlatform?: string
  x?: number
  y?: number
  toX?: number
  toY?: number
  durationMs: number
  followTrack?: BlurTrackPoint[]
}

/**
 * Text, a shape other than a blur (a blur has its own following), and a
 * picture or video smaller than the frame. A full-frame picture has nowhere
 * to move.
 */
export function canFollow(clip: FollowClip) {
  if (clip.kind === "text") return true
  if (clip.kind === "shape") return !isBlurClip(clip)
  if (clip.kind === "image" || clip.kind === "video") return isPlacedPicture(clip)
  return false
}

export function isFollowing(clip: FollowClip) {
  return canFollow(clip) && (clip.followTrack?.length ?? 0) > 1
}

/** How far the item is moved this far into its clip, as shares of the frame. */
export function followOffsetAt(clip: FollowClip, msIntoClip: number) {
  if (!isFollowing(clip)) return { x: 0, y: 0 }
  const track = clip.followTrack!
  const centre = trackCentreAt(track, msIntoClip)!
  return { x: centre.x - track[0].x, y: centre.y - track[0].y }
}

/** The preview's CSS for it, in pixels of a stage this size. Empty when still. */
export function followTranslateCss(
  clip: FollowClip,
  msIntoClip: number,
  stage: { width: number; height: number }
) {
  const offset = followOffsetAt(clip, msIntoClip)
  if (!offset.x && !offset.y) return ""
  return `translate(${round(offset.x * stage.width)}px, ${round(offset.y * stage.height)}px)`
}

/**
 * The export's offset in pixels as ffmpeg expressions of the film's time `t`,
 * added to the layer's overlay position. "0" when the item holds still.
 */
export function followOffsetExpressions(
  clip: FollowClip,
  frame: { width: number; height: number },
  startS: number
) {
  if (!isFollowing(clip)) return { x: "0", y: "0" }
  const track = clip.followTrack!
  const at = (point: BlurTrackPoint) => startS + point.atMs / 1000
  return {
    x: linearOverTime(track.map((point) => ({ atS: at(point), value: round((point.x - track[0].x) * frame.width) }))),
    y: linearOverTime(track.map((point) => ({ atS: at(point), value: round((point.y - track[0].y) * frame.height) }))),
  }
}

/**
 * The part of the frame "Follow what's under it" looks for in the later
 * frames: an arrow's tip, a circle's box, or a box round the middle of text,
 * a sticker or a small video.
 */
export function followBoxOf(clip: FollowClip): ShareBox {
  if (clip.kind === "shape" && !clip.socialPlatform && clip.shape === "arrow") {
    return around(clip.toX ?? 0.5, clip.toY ?? 0.5, 0.16, 0.12)
  }
  if (clip.kind === "shape" && !clip.socialPlatform) {
    const left = Math.min(clip.x ?? 0.4, clip.toX ?? 0.6)
    const top = Math.min(clip.y ?? 0.4, clip.toY ?? 0.6)
    return {
      left,
      top,
      width: Math.max(0.02, Math.abs((clip.toX ?? 0.6) - (clip.x ?? 0.4))),
      height: Math.max(0.02, Math.abs((clip.toY ?? 0.6) - (clip.y ?? 0.4))),
    }
  }
  return around(clip.x ?? 0.5, clip.y ?? 0.5, 0.2, 0.14)
}

function around(x: number, y: number, width: number, height: number): ShareBox {
  const left = Math.min(Math.max(x - width / 2, 0), 1 - width)
  const top = Math.min(Math.max(y - height / 2, 0), 1 - height)
  return { left, top, width, height }
}

/**
 * The two pieces of a following item cut at `offsetMs`. The left keeps the
 * places up to the cut. The right starts where the item had got to, and its
 * places count from its own start, so neither piece jumps at the cut.
 */
export function splitFollow<C extends FollowClip>(
  clip: C,
  offsetMs: number
): { left: Partial<C>; right: Partial<C> } {
  if (!isFollowing(clip)) return { left: {}, right: {} }
  const track = clip.followTrack!
  const centre = trackCentreAt(track, offsetMs)!
  const moved = followOffsetAt(clip, offsetMs)
  const after = track
    .filter((point) => point.atMs > offsetMs)
    .map((point) => ({ ...point, atMs: point.atMs - offsetMs }))
  const right: Partial<FollowClip> = {
    followTrack: [{ atMs: 0, x: centre.x, y: centre.y }, ...after],
    x: clamp((clip.x ?? 0.5) + moved.x),
    y: clamp((clip.y ?? 0.5) + moved.y),
    ...(clip.kind === "shape"
      ? { toX: clamp((clip.toX ?? 0.5) + moved.x), toY: clamp((clip.toY ?? 0.5) + moved.y) }
      : {}),
  }
  return {
    left: { followTrack: track.filter((point) => point.atMs <= offsetMs) } as Partial<C>,
    right: right as Partial<C>,
  }
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value))
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
