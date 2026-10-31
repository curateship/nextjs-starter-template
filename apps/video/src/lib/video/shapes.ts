/**
 * Arrows and circles drawn over the video, to point at something.
 *
 * A shape is a clip of its own kind on a lane, with a start and a length like
 * text. It is placed by two points, each 0 to 1 across and down the frame: an
 * arrow runs from its tail (`x`, `y`) to its tip (`toX`, `toY`), and a circle
 * is the oval inside the box those two points are opposite corners of.
 *
 * A shape can draw itself on over its first half second: the arrow grows out
 * of its tail and the circle traces round from the top. Or it is simply there.
 *
 * Both ends draw from here. The preview puts these paths in an SVG over the
 * stage; the export puts the same paths in an SVG and draws it to a picture.
 * Line widths are pixels of a frame whose short side is 1080, which every
 * shape of project has at full quality, so the same number is the same
 * thickness on a tall video and a wide one.
 */

export const SHAPE_KINDS = ["arrow", "circle"] as const
export type ShapeKind = (typeof SHAPE_KINDS)[number]

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  arrow: "Arrow",
  circle: "Circle",
}

// Red reads against most footage and is what tutorials use to point.
export const DEFAULT_SHAPE_COLOR = "#ff3b30"
export const DEFAULT_SHAPE_LINE_WIDTH = 12
export const MIN_SHAPE_LINE_WIDTH = 2
export const MAX_SHAPE_LINE_WIDTH = 40
export const DEFAULT_SHAPE_DURATION_MS = 3000
/** How long a shape takes to draw itself on. */
export const SHAPE_DRAW_ON_MS = 500

// The arrowhead's two strokes leave the tip at this angle either side of the
// shaft, and are this many line widths long.
const HEAD_ANGLE = (28 * Math.PI) / 180
const HEAD_LENGTH_IN_LINES = 3.5

type ShapeClip = {
  shape?: ShapeKind
  x?: number
  y?: number
  toX?: number
  toY?: number
  lineWidth?: number
  color?: string
  drawOn?: boolean
}

type Frame = { width: number; height: number }

/**
 * Where a new shape lands: in the upper part of the frame, big enough to see
 * and move. Not the middle, because the preview's Play button sits there
 * while the video is paused and would take the press meant for the shape.
 */
export function newShapePlacement(kind: ShapeKind) {
  return kind === "arrow"
    ? { x: 0.2, y: 0.2, toX: 0.5, toY: 0.34 }
    : { x: 0.55, y: 0.18, toX: 0.85, toY: 0.32 }
}

export function shapeLineWidth(clip: ShapeClip) {
  const width = clip.lineWidth
  if (typeof width !== "number" || !Number.isFinite(width)) {
    return DEFAULT_SHAPE_LINE_WIDTH
  }
  return Math.min(MAX_SHAPE_LINE_WIDTH, Math.max(MIN_SHAPE_LINE_WIDTH, width))
}

/** A slow finish, so the line arrives rather than stops. */
function easeOut(value: number) {
  return 1 - (1 - value) ** 3
}

/**
 * How far drawn the shape is this far into its clip, 0 to 1. A shape that
 * does not draw itself on is always whole.
 */
export function shapeProgress(clip: ShapeClip, msIntoClip: number) {
  if (!clip.drawOn) return 1
  return easeOut(Math.min(1, Math.max(0, msIntoClip / SHAPE_DRAW_ON_MS)))
}

/**
 * The export's moments across the draw-on, in milliseconds into the clip:
 * one picture per frame of the film until it is whole, then one still for
 * the rest. Each window carries how far drawn its picture is.
 */
export function shapeExportWindows(
  clip: ShapeClip & { durationMs: number },
  fps: number
) {
  if (!clip.drawOn) {
    return [{ fromMs: 0, toMs: clip.durationMs, progress: 1 }]
  }
  const frameMs = 1000 / fps
  const drawMs = Math.min(SHAPE_DRAW_ON_MS, clip.durationMs)
  const windows: { fromMs: number; toMs: number; progress: number }[] = []
  for (let fromMs = 0; fromMs < drawMs - 0.001; fromMs += frameMs) {
    const toMs = Math.min(drawMs, fromMs + frameMs)
    windows.push({ fromMs, toMs, progress: shapeProgress(clip, fromMs) })
  }
  if (drawMs < clip.durationMs) {
    windows.push({ fromMs: drawMs, toMs: clip.durationMs, progress: 1 })
  }
  return windows
}

export type ShapeStroke = {
  d: string
  /** Set when only part of the line is drawn, as SVG's dash numbers. */
  dashArray?: number
  dashOffset?: number
}

/** The lines that make up the shape, in the frame's own pixels. */
export function shapeStrokes(
  clip: ShapeClip,
  frame: Frame,
  progress: number
): ShapeStroke[] {
  const from = { x: (clip.x ?? 0.5) * frame.width, y: (clip.y ?? 0.5) * frame.height }
  const to = {
    x: (clip.toX ?? 0.5) * frame.width,
    y: (clip.toY ?? 0.5) * frame.height,
  }
  if (progress <= 0) return []
  if (clip.shape === "circle") return circleStrokes(from, to, progress)
  return arrowStrokes(from, to, progress, lineWidthPx(clip, frame))
}

function arrowStrokes(
  tail: { x: number; y: number },
  tip: { x: number; y: number },
  progress: number,
  lineWidth: number
): ShapeStroke[] {
  // The arrow grows out of its tail, its head riding on the end.
  const end = {
    x: tail.x + (tip.x - tail.x) * progress,
    y: tail.y + (tip.y - tail.y) * progress,
  }
  const length = Math.hypot(end.x - tail.x, end.y - tail.y)
  if (length < 0.5) return []
  const angle = Math.atan2(end.y - tail.y, end.x - tail.x)
  // Never longer than half the shaft, so a short arrow is still an arrow.
  const head = Math.min(lineWidth * HEAD_LENGTH_IN_LINES, length / 2)
  const wing = (side: number) => ({
    x: end.x - head * Math.cos(angle + side * HEAD_ANGLE),
    y: end.y - head * Math.sin(angle + side * HEAD_ANGLE),
  })
  const left = wing(1)
  const right = wing(-1)
  return [
    { d: `M${fmt(tail.x)} ${fmt(tail.y)}L${fmt(end.x)} ${fmt(end.y)}` },
    {
      d: `M${fmt(left.x)} ${fmt(left.y)}L${fmt(end.x)} ${fmt(end.y)}L${fmt(right.x)} ${fmt(right.y)}`,
    },
  ]
}

function circleStrokes(
  corner: { x: number; y: number },
  opposite: { x: number; y: number },
  progress: number
): ShapeStroke[] {
  const cx = (corner.x + opposite.x) / 2
  const cy = (corner.y + opposite.y) / 2
  const rx = Math.abs(opposite.x - corner.x) / 2
  const ry = Math.abs(opposite.y - corner.y) / 2
  if (rx < 0.5 || ry < 0.5) return []
  // From the top, clockwise, in two halves: SVG cannot draw a whole ellipse
  // as one arc.
  const d = `M${fmt(cx)} ${fmt(cy - ry)}A${fmt(rx)} ${fmt(ry)} 0 1 1 ${fmt(cx)} ${fmt(cy + ry)}A${fmt(rx)} ${fmt(ry)} 0 1 1 ${fmt(cx)} ${fmt(cy - ry)}`
  if (progress >= 1) return [{ d }]
  // Ramanujan's sum, within a hair of the true length for any oval drawn.
  const h = ((rx - ry) / (rx + ry)) ** 2
  const perimeter =
    Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
  return [{ d, dashArray: perimeter, dashOffset: perimeter * (1 - progress) }]
}

/** The line's width in this frame's pixels. */
function lineWidthPx(clip: ShapeClip, frame: Frame) {
  return (shapeLineWidth(clip) * Math.min(frame.width, frame.height)) / 1080
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/**
 * The frame both ends draw a shape in at full quality: short side 1080, so
 * 1080 by 1920 for a tall project and 1920 by 1080 for a wide one. The
 * preview draws in these units and lets the SVG scale to the stage.
 */
export function shapeDesignFrame(frameRatio: number): Frame {
  return frameRatio >= 1
    ? { width: Math.round(1080 * frameRatio), height: 1080 }
    : { width: 1080, height: Math.round(1080 / frameRatio) }
}

/** The shape's lines as SVG paths, without the SVG around them. */
export function shapePathsMarkup(clip: ShapeClip, frame: Frame, progress: number) {
  const color =
    clip.color && HEX_COLOR.test(clip.color) ? clip.color : DEFAULT_SHAPE_COLOR
  const width = fmt(lineWidthPx(clip, frame))
  return shapeStrokes(clip, frame, progress)
    .map(
      (stroke) =>
        `<path d="${stroke.d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${
          stroke.dashArray === undefined
            ? ""
            : ` stroke-dasharray="${fmt(stroke.dashArray)}" stroke-dashoffset="${fmt(stroke.dashOffset ?? 0)}"`
        }/>`
    )
    .join("")
}

/** The shape as a whole SVG the size of the frame, for the export. */
export function shapeSvg(clip: ShapeClip, frame: Frame, progress: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}">${shapePathsMarkup(clip, frame, progress)}</svg>`
}

function fmt(value: number) {
  return String(Math.round(value * 100) / 100)
}
