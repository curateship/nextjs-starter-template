/**
 * How big a picture or video clip is on the frame, and where it sits.
 *
 * Two things size it. The box, `boxWidth` and `boxHeight`, is the shape the
 * clip is fitted or filled into, as a share of the frame across and down: 1
 * and 1 is the frame itself, 1 and 0.5 is the top or bottom half of a split.
 * Then `scale` shrinks the fitted result: 1 is the whole box, 0.3 is a box 30%
 * as wide and 30% as tall. `x` and `y` are where the middle of that box sits,
 * 0 to 1 across and down, the same two numbers a text clip is dragged by.
 *
 * All of them absent means a full-frame clip in the middle, so every timeline
 * saved before this existed reads and exports exactly as it did. A picture
 * sticker is the one thing that arrives smaller (`STICKER_PICTURE_SCALE`).
 *
 * This module is where the preview and the export agree. The preview sizes a
 * box of that shape and lets `object-fit` do the fitting inside it. The export
 * fits the clip to a box of the same pixels, scales the result by the same
 * number, and overlays it with its middle on the same spot.
 *
 * A video clip shares one `<video>` per file in the preview, which is why
 * videos once stayed full frame. That element only ever shows one clip of its
 * file at a time (the top one), so the frame loop places it from whichever
 * clip that is, the same way it already sets fit and colour per clip.
 */

export const MIN_CLIP_SCALE = 0.1
export const MAX_CLIP_SCALE = 1
export const CLIP_SCALE_STEP = 0.01

// The box can be as thin as a tenth of the frame, the same floor as the size.
export const MIN_CLIP_BOX = 0.1
export const MAX_CLIP_BOX = 1

// A logo or an arrow at 30% of the frame reads clearly on a phone without
// covering the thing it points at. On a tall project a square logo lands at
// 324 pixels of the 1080 across.
export const STICKER_PICTURE_SCALE = 0.3

type Placed = {
  kind: string
  scale?: number
  x?: number
  y?: number
  boxWidth?: number
  boxHeight?: number
}

/** Only pictures and videos have a size; sound and words do not. */
function isSizedKind(kind: string) {
  return kind === "image" || kind === "video"
}

function clampShare(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return max
  return Math.min(max, Math.max(min, value))
}

/** The size this clip is set to, with anything unset reading as full frame. */
export function clipScale(clip: Placed): number {
  if (!isSizedKind(clip.kind)) return MAX_CLIP_SCALE
  return clampShare(clip.scale, MIN_CLIP_SCALE, MAX_CLIP_SCALE)
}

/** The value to store, or nothing when it is the full frame. */
export function storedClipScale(scale: number): number | undefined {
  return scale >= MAX_CLIP_SCALE ? undefined : scale
}

/** The box this clip is fitted into, as a share of the frame. */
export function clipBox(clip: Placed): { width: number; height: number } {
  if (!isSizedKind(clip.kind)) return { width: 1, height: 1 }
  return {
    width: clampShare(clip.boxWidth, MIN_CLIP_BOX, MAX_CLIP_BOX),
    height: clampShare(clip.boxHeight, MIN_CLIP_BOX, MAX_CLIP_BOX),
  }
}

/**
 * Whether this clip is smaller than the frame, so it has somewhere to be
 * dragged to. True of a shrunk picture or video and of one in a split's box.
 */
export function isPlacedPicture(clip: Placed) {
  const box = clipBox(clip)
  return (
    clipScale(clip) < MAX_CLIP_SCALE ||
    box.width < MAX_CLIP_BOX ||
    box.height < MAX_CLIP_BOX
  )
}

/** How much of the frame, across and down, a fitted picture covers. */
export type FrameShare = { width: number; height: number }

const FULL_SHARE: FrameShare = { width: 1, height: 1 }

/**
 * The share of its box a picture of this shape covers once it is fitted
 * inside: a square logo in a tall 9:16 box covers all of the width and 56% of
 * the height. `boxRatio` is the box's own width over height.
 */
export function containedShare(
  pictureRatio: number,
  boxRatio: number
): FrameShare {
  if (!(pictureRatio > 0) || !(boxRatio > 0)) return FULL_SHARE
  return pictureRatio > boxRatio
    ? { width: 1, height: boxRatio / pictureRatio }
    : { width: pictureRatio / boxRatio, height: 1 }
}

/** The box's width over its height, for a frame of `frameRatio`. */
export function clipBoxRatio(clip: Placed, frameRatio: number) {
  const box = clipBox(clip)
  return (frameRatio * box.width) / box.height
}

/**
 * The preview's box for this clip, in percent of the stage. A full-frame clip
 * ignores `x` and `y`, the way it always has.
 *
 * `share` is how much of its box the fitted picture covers. Passing it makes
 * the box hug the picture, so the see-through strips beside a square logo do
 * not catch clicks meant for whatever is under them. Without it the box keeps
 * its own shape and `object-fit` centres the picture in it, which draws the
 * same thing.
 */
export function pictureBoxCss(clip: Placed, share: FrameShare = FULL_SHARE) {
  if (!isPlacedPicture(clip)) {
    return { left: "0%", top: "0%", width: "100%", height: "100%" }
  }
  const scale = clipScale(clip)
  const box = clipBox(clip)
  const x = clip.x ?? 0.5
  const y = clip.y ?? 0.5
  const width = scale * box.width * share.width
  const height = scale * box.height * share.height
  return {
    left: percent(x - width / 2),
    top: percent(y - height / 2),
    width: percent(width),
    height: percent(height),
  }
}

// Rounded, so the same box always writes the same text: the preview's frame
// loop compares it with what the element already has before touching it,
// and 66.99999999999999% would never match the 67% the browser keeps.
function percent(share: number) {
  return `${Math.round(share * 1_000_000) / 10_000}%`
}

/**
 * The pixels the export fits this clip into before shrinking it: the frame,
 * or the clip's box of it. Even sides, because a picture with odd sides cannot
 * be converted to the 4:2:0 colour the final film is written in.
 */
export function pictureBoxSize(
  clip: Placed,
  frame: { width: number; height: number }
) {
  const box = clipBox(clip)
  if (box.width >= MAX_CLIP_BOX && box.height >= MAX_CLIP_BOX) return frame
  return {
    width: Math.max(2, Math.round((frame.width * box.width) / 2) * 2),
    height: Math.max(2, Math.round((frame.height * box.height) / 2) * 2),
  }
}

/** The ffmpeg stage that shrinks a fitted picture, or null at full size. */
export function pictureScaleFilter(clip: Placed): string | null {
  const scale = clipScale(clip)
  if (scale >= MAX_CLIP_SCALE) return null
  return `scale=trunc(iw*${scale}/2)*2:trunc(ih*${scale}/2)*2`
}

/**
 * Where the export's `overlay` puts the picture's top-left corner. At full
 * frame this is the centring it has always used.
 */
export function pictureOverlayPosition(clip: Placed) {
  if (!isPlacedPicture(clip)) {
    return { x: "(W-w)/2", y: "(H-h)/2" }
  }
  return {
    x: `W*${clip.x ?? 0.5}-w/2`,
    y: `H*${clip.y ?? 0.5}-h/2`,
  }
}
