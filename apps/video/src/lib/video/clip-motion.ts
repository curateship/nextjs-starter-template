/**
 * A slow move across a still picture, so a photo held on screen reads as part
 * of the film rather than as a frozen player.
 *
 * Each move is a start and an end: how much bigger than the frame the picture
 * is drawn, and how far across it sits, as a share of the frame's width. The
 * picture travels from one to the other at an even speed over the clip's whole
 * time on screen. Absent means still, so every timeline saved before this
 * setting existed reads and renders exactly as it did.
 *
 * Every move stays at 1x or bigger, and a drift never shifts the picture
 * further than its extra size covers. That is what keeps the edge of the
 * picture from ever coming into view.
 *
 * This module is the one place the three ends agree: the schema takes the
 * names from here, the preview asks for its CSS here, and the export builds
 * its ffmpeg stage here. Only picture clips move.
 */

export const CLIP_MOTIONS = [
  "push-in",
  "pull-out",
  "drift-left",
  "drift-right",
] as const
export type ClipMotion = (typeof CLIP_MOTIONS)[number]

type MotionPose = { scale: number; shiftX: number }

// 1.1 is enough to feel over three or four seconds without anyone noticing a
// zoom as such. A drift is drawn at the same size and moves 4% of the frame
// each way, inside the 5% on each side that the extra size provides.
const MOTION_SCALE = 1.1
const DRIFT_SHIFT = 0.04

const MOTION_PATHS: Record<ClipMotion, { from: MotionPose; to: MotionPose }> =
  {
    "push-in": {
      from: { scale: 1, shiftX: 0 },
      to: { scale: MOTION_SCALE, shiftX: 0 },
    },
    "pull-out": {
      from: { scale: MOTION_SCALE, shiftX: 0 },
      to: { scale: 1, shiftX: 0 },
    },
    "drift-left": {
      from: { scale: MOTION_SCALE, shiftX: DRIFT_SHIFT },
      to: { scale: MOTION_SCALE, shiftX: -DRIFT_SHIFT },
    },
    "drift-right": {
      from: { scale: MOTION_SCALE, shiftX: -DRIFT_SHIFT },
      to: { scale: MOTION_SCALE, shiftX: DRIFT_SHIFT },
    },
  }

/** The inspector's choices, in the order they are shown. */
export const CLIP_MOTION_OPTIONS: {
  id: ClipMotion | "none"
  label: string
}[] = [
  { id: "none", label: "Still" },
  { id: "push-in", label: "Push in" },
  { id: "pull-out", label: "Pull out" },
  { id: "drift-left", label: "Drift left" },
  { id: "drift-right", label: "Drift right" },
]

/** The move this clip makes, or nothing when it holds still. */
export function clipMotion(clip: {
  kind: string
  motion?: string
}): ClipMotion | null {
  if (clip.kind !== "image") return null
  return (CLIP_MOTIONS as readonly string[]).includes(clip.motion ?? "")
    ? (clip.motion as ClipMotion)
    : null
}

/**
 * Where the picture is `elapsedMs` into a clip `durationMs` long. Before the
 * clip starts it holds its first pose, which is what a picture reaching back
 * over a crossfade shows, and past the end it holds its last.
 */
export function motionPoseAt(
  motion: ClipMotion,
  elapsedMs: number,
  durationMs: number
): MotionPose {
  const progress =
    durationMs > 0 ? Math.min(1, Math.max(0, elapsedMs / durationMs)) : 0
  const { from, to } = MOTION_PATHS[motion]
  return {
    scale: from.scale + (to.scale - from.scale) * progress,
    shiftX: from.shiftX + (to.shiftX - from.shiftX) * progress,
  }
}

/**
 * The preview's CSS for one pose. The picture element covers the whole
 * frame, so a percentage shift is a share of the frame's width, and the scale
 * grows it about the frame's middle, which is CSS's default origin.
 */
export function motionTransformCss(pose: MotionPose): string {
  return `translateX(${pose.shiftX * 100}%) scale(${pose.scale})`
}

/**
 * The ffmpeg stages that make the same move on a picture already sized to the
 * frame by the fit stage.
 *
 * `pad` first makes the layer exactly the frame, with see-through edges where
 * a fitted picture leaves room. The preview scales its whole frame-sized
 * element, black bars included, so the export has to scale the same box.
 *
 * `perspective` then redraws each frame from a rectangle of the source. It
 * places that rectangle to a fraction of a pixel. The usual tool, `zoompan`,
 * rounds its position to whole pixels, and a slow zoom made of whole pixels
 * visibly shakes. `in` is the frame number, so frame `n` of a clip `frameCount`
 * frames long is `n / frameCount` of the way through, which is the same
 * fraction the preview reaches at that frame's time.
 *
 * The rectangle is the frame mapped backwards through the move: output pixel
 * `u` shows source pixel `W/2 + (u - W/2 - shift * W) / scale`. The four
 * corners are that sum at `u = 0` and `u = W`, and the same without a shift
 * for the height.
 */
export function motionFilter(
  motion: ClipMotion,
  width: number,
  height: number,
  frameCount: number
): string {
  const { from, to } = MOTION_PATHS[motion]
  const progress = `min(1,in/${Math.max(1, frameCount)})`
  const between = (a: number, b: number) =>
    a === b ? `(${a})` : `(${a}+(${round(b - a)})*${progress})`
  const scale = between(from.scale, to.scale)
  const shift = between(from.shiftX, to.shiftX)
  const left = `W*(0.5-(0.5+${shift})/${scale})`
  const right = `W*(0.5+(0.5-${shift})/${scale})`
  const top = `H*(0.5-0.5/${scale})`
  const bottom = `H*(0.5+0.5/${scale})`
  return [
    "format=rgba",
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
    `perspective=x0='${left}':y0='${top}':x1='${right}':y1='${top}':x2='${left}':y2='${bottom}':x3='${right}':y3='${bottom}':interpolation=cubic:eval=frame`,
  ].join(",")
}

function round(value: number) {
  return Math.round(value * 1e6) / 1e6
}
