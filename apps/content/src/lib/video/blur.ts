/**
 * A blur over one spot of the video: a face, a number plate, a screen.
 *
 * A blur is a shape clip (`shape: "blur"`) with a start and a length like any
 * shape. Its box is the same two points a circle uses, `x`/`y` and
 * `toX`/`toY`, each 0 to 1 across and down the frame, and it is drawn as that
 * box or as the oval inside it. It blurs everything on the lanes under it and
 * nothing on the lanes above, because it is one more layer in the stack.
 *
 * Strength is counted on a frame whose short side is 1080, the way a shape's
 * line is, so 20 is the same softness on a tall video and a wide one. It is a
 * Gaussian blur's spread in those pixels: the browser's CSS `blur()` and
 * ffmpeg's `gblur` both take that number.
 *
 * A blur that follows something carries a list of where its middle is, one
 * place every half second of the clip (see blur-follow.ts on the server). The
 * box keeps its size and slides in a straight line between the places. The
 * preview and the export read the same list through `blurBoxAt` and
 * `blurExpressions`.
 */

export const BLUR_SHAPES = ["box", "oval"] as const
export type BlurShape = (typeof BLUR_SHAPES)[number]

export const BLUR_SHAPE_LABELS: Record<BlurShape, string> = {
  box: "Box",
  oval: "Oval",
}

export const MIN_BLUR_STRENGTH = 1
export const MAX_BLUR_STRENGTH = 60
export const DEFAULT_BLUR_STRENGTH = 20
export const DEFAULT_BLUR_DURATION_MS = 3000

/** How far apart the places of a followed blur are, along the clip. */
export const BLUR_TRACK_STEP_MS = 500
/** Four minutes of places. A longer blur follows its first four minutes. */
export const MAX_BLUR_TRACK_POINTS = 480

export type BlurTrackPoint = { atMs: number; x: number; y: number }

export const BLUR_NOT_FOUND_MESSAGE =
  "That blur isn't saved yet. Wait a moment and try again."
export const BLUR_NOTHING_UNDER_MESSAGE =
  "There's nothing under the blur to follow."
export const BLUR_FOLLOW_FAILED_MESSAGE = "Couldn't follow it this time"

type BlurClip = {
  kind?: string
  shape?: string
  blurShape?: BlurShape
  blurStrength?: number
  x?: number
  y?: number
  toX?: number
  toY?: number
  blurTrack?: BlurTrackPoint[]
}

type Frame = { width: number; height: number }

/** A box as shares of the frame: its top-left corner and its size. */
export type ShareBox = { left: number; top: number; width: number; height: number }

export function isBlurClip(clip: BlurClip) {
  return clip.kind === "shape" && clip.shape === "blur"
}

/**
 * Where a new blur lands: in the upper middle of the frame. Not dead centre,
 * because the preview's Play button sits there while the video is paused and
 * would take the press meant for the blur.
 */
export function newBlurPlacement() {
  return { x: 0.36, y: 0.16, toX: 0.64, toY: 0.36 }
}

export function blurStrength(clip: BlurClip) {
  const strength = clip.blurStrength
  if (typeof strength !== "number" || !Number.isFinite(strength)) {
    return DEFAULT_BLUR_STRENGTH
  }
  return Math.min(MAX_BLUR_STRENGTH, Math.max(MIN_BLUR_STRENGTH, strength))
}

export function blurShape(clip: BlurClip): BlurShape {
  return clip.blurShape === "oval" ? "oval" : "box"
}

/** The blur's spread in this frame's pixels. */
export function blurSigma(clip: BlurClip, frame: Frame) {
  return (blurStrength(clip) * Math.min(frame.width, frame.height)) / 1080
}

/** The box the two points span, before any following moves it. */
function placedBox(clip: BlurClip): ShareBox {
  const fromX = clip.x ?? 0.5
  const fromY = clip.y ?? 0.5
  const toX = clip.toX ?? 0.5
  const toY = clip.toY ?? 0.5
  return {
    left: Math.min(fromX, toX),
    top: Math.min(fromY, toY),
    width: Math.abs(toX - fromX),
    height: Math.abs(toY - fromY),
  }
}

/**
 * Where a followed blur's middle is this far into its clip: in a straight
 * line between the two places either side, the first place before the first
 * and the last after the last. Null when the blur follows nothing.
 */
export function trackCentreAt(track: BlurTrackPoint[] | undefined, msIntoClip: number) {
  if (!track?.length) return null
  if (msIntoClip <= track[0].atMs) return { x: track[0].x, y: track[0].y }
  for (let index = 1; index < track.length; index += 1) {
    const after = track[index]
    if (msIntoClip > after.atMs) continue
    const before = track[index - 1]
    const span = after.atMs - before.atMs
    const share = span > 0 ? (msIntoClip - before.atMs) / span : 1
    return {
      x: before.x + (after.x - before.x) * share,
      y: before.y + (after.y - before.y) * share,
    }
  }
  const last = track[track.length - 1]
  return { x: last.x, y: last.y }
}

/** Keeps a box of this size whole inside the frame, by sliding it. */
function insideFrame(left: number, top: number, width: number, height: number): ShareBox {
  return {
    left: Math.min(Math.max(left, 0), Math.max(0, 1 - width)),
    top: Math.min(Math.max(top, 0), Math.max(0, 1 - height)),
    width: Math.min(width, 1),
    height: Math.min(height, 1),
  }
}

/**
 * The blur's box this far into its clip. A blur that follows something is
 * its placed box moved so its middle sits on the followed place.
 */
export function blurBoxAt(clip: BlurClip, msIntoClip: number): ShareBox {
  const box = placedBox(clip)
  const centre = trackCentreAt(clip.blurTrack, msIntoClip)
  if (!centre) return insideFrame(box.left, box.top, box.width, box.height)
  return insideFrame(
    centre.x - box.width / 2,
    centre.y - box.height / 2,
    box.width,
    box.height
  )
}

/**
 * The places of a followed blur, tidied: inside the clip, in order, one per
 * moment, inside the frame, and at most the cap. Whatever a model sent back
 * goes through this before it is saved.
 */
export function cleanBlurTrack(points: BlurTrackPoint[], durationMs: number) {
  const seen = new Set<number>()
  return points
    .filter(
      (point) =>
        Number.isFinite(point.atMs) &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.atMs >= 0 &&
        point.atMs <= durationMs
    )
    .map((point) => ({
      atMs: Math.round(point.atMs),
      x: Math.min(1, Math.max(0, point.x)),
      y: Math.min(1, Math.max(0, point.y)),
    }))
    .sort((a, b) => a.atMs - b.atMs)
    .filter((point) => {
      if (seen.has(point.atMs)) return false
      seen.add(point.atMs)
      return true
    })
    .slice(0, MAX_BLUR_TRACK_POINTS)
}

/** The moments a blur is looked at to follow something, into its clip. */
export function blurFollowMoments(durationMs: number) {
  const moments: number[] = []
  for (
    let atMs = 0;
    atMs <= durationMs && moments.length < MAX_BLUR_TRACK_POINTS;
    atMs += BLUR_TRACK_STEP_MS
  ) {
    moments.push(atMs)
  }
  return moments
}

// --- The export ---------------------------------------------------------------

/** Rounds to an even number: ffmpeg's colour planes are half size. */
function even(value: number) {
  return Math.max(2, Math.round(value / 2) * 2)
}

/**
 * The export's numbers for a blur: the size of its box in pixels, and where
 * its top-left corner is as an ffmpeg expression of the film's time `t`. A
 * blur that follows nothing has plain numbers for its corner. `startS` is
 * where the clip starts on the film.
 */
export function blurExpressions(
  clip: BlurClip & { durationMs: number },
  frame: Frame,
  startS: number
) {
  const box = placedBox(clip)
  const width = Math.min(even(box.width * frame.width), even(frame.width))
  const height = Math.min(even(box.height * frame.height), even(frame.height))
  const corner = (centre: { x: number; y: number }) => {
    const placed = insideFrame(
      centre.x - box.width / 2,
      centre.y - box.height / 2,
      box.width,
      box.height
    )
    return {
      x: Math.min(Math.round(placed.left * frame.width), frame.width - width),
      y: Math.min(Math.round(placed.top * frame.height), frame.height - height),
    }
  }

  const track = clip.blurTrack?.length ? clip.blurTrack : null
  if (!track) {
    const still = blurBoxAt(clip, 0)
    return {
      width,
      height,
      x: String(Math.min(Math.round(still.left * frame.width), frame.width - width)),
      y: String(Math.min(Math.round(still.top * frame.height), frame.height - height)),
    }
  }

  const corners = track.map((point) => ({
    atS: startS + point.atMs / 1000,
    ...corner(point),
  }))
  return {
    width,
    height,
    x: linearOverTime(corners.map((point) => ({ atS: point.atS, value: point.x }))),
    y: linearOverTime(corners.map((point) => ({ atS: point.atS, value: point.y }))),
  }
}

/**
 * A value that moves in a straight line between points in time, written as
 * one ffmpeg expression of `t`: the first value before the first point, and
 * the last after the last.
 */
export function linearOverTime(points: { atS: number; value: number }[]) {
  if (points.length === 1) return String(points[0].value)
  let expression = String(points[points.length - 1].value)
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const from = points[index]
    const to = points[index + 1]
    const span = Math.max(0.001, to.atS - from.atS)
    const step = `${from.value}+(${to.value - from.value})*clip((t-${from.atS.toFixed(3)})/${span.toFixed(3)},0,1)`
    expression = `if(lt(t,${to.atS.toFixed(3)}),${step},${expression})`
  }
  return expression
}

/**
 * The oval's shape as a picture the size of the box: white where the blur
 * shows, black where it does not. A box is all white. ffmpeg's `alphamerge`
 * reads it as the blurred copy's see-through layer.
 */
export function blurMaskSvg(shape: BlurShape, width: number, height: number) {
  const inside =
    shape === "oval"
      ? `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="#fff"/>`
      : `<rect width="${width}" height="${height}" fill="#fff"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#000"/>${inside}</svg>`
}
