import { clipScale, isPlacedPicture, pictureBoxSize } from "./clip-size"

/**
 * The shape of a picture or video that sits smaller than the frame, such as
 * the corner box over a screen recording: a plain rectangle, rounded corners,
 * or a circle, with an optional border (workspace/docs/video-on-video.md).
 *
 * A shape needs the clip to fill its box (`fit: "cover"`), because only then
 * is the drawn picture exactly the box, the same size in the preview and the
 * export. A clip set to fit inside its box draws as a plain rectangle with no
 * border. Choosing rounded or circle in the inspector sets the clip to fill,
 * and circle also makes the box square.
 *
 * The preview rounds the element with `border-radius` and draws the border as
 * an outline inside its edge. The export cuts the same shape out with a mask
 * drawn at the picture's exact size and lays a ring of the same width on top.
 * Both work out the corners and the border from the numbers here.
 */

export const FRAME_SHAPES = ["rectangle", "rounded", "circle"] as const
export type FrameShape = (typeof FRAME_SHAPES)[number]

export const FRAME_SHAPE_LABELS: Record<FrameShape, string> = {
  rectangle: "Rectangle",
  rounded: "Rounded",
  circle: "Circle",
}

/** Rounded corners, as a share of the box's shorter side. */
export const MIN_CORNER_SHARE = 0.02
export const MAX_CORNER_SHARE = 0.5
export const DEFAULT_CORNER_SHARE = 0.15

/** A border's thickness, in pixels of a frame whose short side is 1080. */
export const MIN_FRAME_BORDER = 1
export const MAX_FRAME_BORDER = 30
export const DEFAULT_FRAME_BORDER = 8
export const DEFAULT_FRAME_BORDER_COLOR = "#ffffff"

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

type ShapedClip = {
  kind: string
  fit?: string
  scale?: number
  x?: number
  y?: number
  boxWidth?: number
  boxHeight?: number
  frameShape?: FrameShape
  cornerRadius?: number
  borderColor?: string
  borderWidth?: number
}

/** Whether this clip can take a shape: a picture or video smaller than the frame. */
export function canTakeFrameShape(clip: ShapedClip) {
  return (clip.kind === "image" || clip.kind === "video") && isPlacedPicture(clip)
}

/**
 * Whether the shape and border are drawn: the clip can take one and fills its
 * box. Otherwise it is a plain rectangle, whatever is stored.
 */
function shapeDrawn(clip: ShapedClip) {
  return canTakeFrameShape(clip) && clip.fit === "cover"
}

export function clipFrameShape(clip: ShapedClip): FrameShape {
  if (!shapeDrawn(clip)) return "rectangle"
  return (FRAME_SHAPES as readonly string[]).includes(clip.frameShape ?? "")
    ? (clip.frameShape as FrameShape)
    : "rectangle"
}

export function clipCornerShare(clip: ShapedClip) {
  const value = clip.cornerRadius
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CORNER_SHARE
  return Math.min(MAX_CORNER_SHARE, Math.max(MIN_CORNER_SHARE, value))
}

/** The border, or null when there is none to draw. */
export function clipFrameBorder(clip: ShapedClip): { color: string; width: number } | null {
  if (!shapeDrawn(clip)) return null
  const width = clip.borderWidth
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return null
  const color = HEX_COLOR.test(clip.borderColor ?? "") ? clip.borderColor! : DEFAULT_FRAME_BORDER_COLOR
  return { color, width: Math.min(MAX_FRAME_BORDER, Math.max(MIN_FRAME_BORDER, width)) }
}

/** Whether the export has anything to cut out or draw round this clip. */
export function hasFrameShaping(clip: ShapedClip) {
  return clipFrameShape(clip) !== "rectangle" || clipFrameBorder(clip) !== null
}

/**
 * The box that makes a circle round: the biggest square the frame holds,
 * as shares of the frame across and down.
 */
export function squareBox(frameRatio: number) {
  return frameRatio <= 1
    ? { boxWidth: 1, boxHeight: Math.max(0.1, round(frameRatio)) }
    : { boxWidth: Math.max(0.1, round(1 / frameRatio)), boxHeight: 1 }
}

/**
 * The picture's size in pixels once the export has filled its box and shrunk
 * it, the same sums as `pictureBoxSize` and `pictureScaleFilter`.
 */
export function shapedPictureSize(
  clip: ShapedClip,
  frame: { width: number; height: number }
) {
  const box = pictureBoxSize(clip, frame)
  const scale = clipScale(clip)
  if (scale >= 1) return box
  return {
    width: Math.trunc((box.width * scale) / 2) * 2,
    height: Math.trunc((box.height * scale) / 2) * 2,
  }
}

/** A frame-sized pixel count from a 1080-short-side one. */
function framePx(value: number, frame: { width: number; height: number }) {
  return (value * Math.min(frame.width, frame.height)) / 1080
}

/**
 * The preview's corners and border for this clip, on a stage of this size, as
 * CSS. The outline sits inside the edge, as the export's ring does.
 */
export function frameShapeCss(
  clip: ShapedClip,
  stage: { width: number; height: number }
): { borderRadius: string; outline: string; outlineOffset: string } {
  const shape = clipFrameShape(clip)
  const border = clipFrameBorder(clip)
  const size = shapedPictureSize(clip, stage)
  const radius =
    shape === "circle"
      ? "50%"
      : shape === "rounded"
        ? `${fmt(clipCornerShare(clip) * Math.min(size.width, size.height))}px`
        : ""
  if (!border) return { borderRadius: radius, outline: "", outlineOffset: "" }
  const width = fmt(framePx(border.width, stage))
  return {
    borderRadius: radius,
    outline: `${width}px solid ${border.color}`,
    outlineOffset: `-${width}px`,
  }
}

/** The outline of the shape in a box this size, as an SVG element without a fill or line. */
function outlineElement(shape: FrameShape, width: number, height: number, corner: number, inset: number) {
  if (shape === "circle") {
    return `<ellipse cx="${fmt(width / 2)}" cy="${fmt(height / 2)}" rx="${fmt(width / 2 - inset)}" ry="${fmt(height / 2 - inset)}"`
  }
  const r = shape === "rounded" ? Math.max(0, corner - inset) : 0
  return `<rect x="${fmt(inset)}" y="${fmt(inset)}" width="${fmt(width - 2 * inset)}" height="${fmt(height - 2 * inset)}" rx="${fmt(r)}" ry="${fmt(r)}"`
}

/**
 * The export's mask: white where the picture shows and black where it is cut
 * away, exactly the picture's size.
 */
export function frameMaskSvg(clip: ShapedClip, width: number, height: number) {
  const shape = clipFrameShape(clip)
  const corner = clipCornerShare(clip) * Math.min(width, height)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#000000"/>${outlineElement(shape, width, height, corner, 0)} fill="#ffffff"/></svg>`
}

/**
 * The export's border: a ring of the border's colour just inside the shape's
 * edge, on a see-through picture the picture's size. Null with no border.
 */
export function frameRingSvg(
  clip: ShapedClip,
  width: number,
  height: number,
  frame: { width: number; height: number }
) {
  const border = clipFrameBorder(clip)
  if (!border) return null
  const shape = clipFrameShape(clip)
  const corner = clipCornerShare(clip) * Math.min(width, height)
  const line = framePx(border.width, frame)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${outlineElement(shape, width, height, corner, line / 2)} fill="none" stroke="${border.color}" stroke-width="${fmt(line)}"/></svg>`
}

function fmt(value: number) {
  return String(Math.round(value * 100) / 100)
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
