/**
 * How big a picture clip is on the frame, and where it sits.
 *
 * `scale` shrinks the picture after it has been fitted to the frame: 1 is the
 * whole frame, 0.3 is a box 30% as wide and 30% as tall. `x` and `y` are where
 * the middle of that box sits, 0 to 1 across and down, the same two numbers a
 * text clip is dragged by.
 *
 * All three absent means a full-frame picture in the middle, so every timeline
 * saved before this existed reads and exports exactly as it did. A picture
 * sticker is the one thing that arrives smaller (`STICKER_PICTURE_SCALE`).
 *
 * This module is where the preview and the export agree. The preview sizes a
 * frame-shaped box and lets `object-fit` do the fitting inside it. The export
 * fits the picture to the frame, scales the result by the same number, and
 * overlays it with its middle on the same spot.
 */

export const MIN_CLIP_SCALE = 0.1
export const MAX_CLIP_SCALE = 1
export const CLIP_SCALE_STEP = 0.01

// A logo or an arrow at 30% of the frame reads clearly on a phone without
// covering the thing it points at. On a tall project a square logo lands at
// 324 pixels of the 1080 across.
export const STICKER_PICTURE_SCALE = 0.3

type Placed = { kind: string; scale?: number; x?: number; y?: number }

/**
 * The size this clip is set to, with anything unset reading as full frame.
 * Only a picture has a size: video shares one full-frame player per file in
 * the preview, so a video clip is always the whole frame.
 */
export function clipScale(clip: Placed): number {
  const scale = clip.scale
  if (clip.kind !== "image") return MAX_CLIP_SCALE
  if (typeof scale !== "number" || !Number.isFinite(scale)) return MAX_CLIP_SCALE
  return Math.min(MAX_CLIP_SCALE, Math.max(MIN_CLIP_SCALE, scale))
}

/** The value to store, or nothing when it is the full frame. */
export function storedClipScale(scale: number): number | undefined {
  return scale >= MAX_CLIP_SCALE ? undefined : scale
}

/** Only a picture smaller than the frame has anywhere to be dragged to. */
export function isPlacedPicture(clip: Placed) {
  return clipScale(clip) < MAX_CLIP_SCALE
}

/** How much of the frame, across and down, a fitted picture covers. */
export type FrameShare = { width: number; height: number }

const FULL_SHARE: FrameShare = { width: 1, height: 1 }

/**
 * The share of the frame a picture of this shape covers once it is fitted
 * inside: a square logo in a tall 9:16 frame covers all of the width and 56%
 * of the height.
 */
export function containedShare(
  pictureRatio: number,
  frameRatio: number
): FrameShare {
  if (!(pictureRatio > 0) || !(frameRatio > 0)) return FULL_SHARE
  return pictureRatio > frameRatio
    ? { width: 1, height: frameRatio / pictureRatio }
    : { width: pictureRatio / frameRatio, height: 1 }
}

/**
 * The preview's box for this picture, in percent of the stage. A full-frame
 * picture ignores `x` and `y`, the way it always has.
 *
 * `share` is how much of the frame the fitted picture covers. Passing it
 * makes the box hug the picture, so the see-through strips beside a square
 * logo do not catch clicks meant for whatever is under them. Without it the
 * box is frame-shaped and `object-fit` centres the picture in it, which draws
 * the same thing.
 */
export function pictureBoxCss(clip: Placed, share: FrameShare = FULL_SHARE) {
  const scale = clipScale(clip)
  if (scale >= MAX_CLIP_SCALE) {
    return { left: "0%", top: "0%", width: "100%", height: "100%" }
  }
  const x = clip.x ?? 0.5
  const y = clip.y ?? 0.5
  const width = scale * share.width
  const height = scale * share.height
  return {
    left: `${(x - width / 2) * 100}%`,
    top: `${(y - height / 2) * 100}%`,
    width: `${width * 100}%`,
    height: `${height * 100}%`,
  }
}

/** The ffmpeg stage that shrinks a fitted picture, or null at full frame. */
export function pictureScaleFilter(clip: Placed): string | null {
  const scale = clipScale(clip)
  if (scale >= MAX_CLIP_SCALE) return null
  // Even sides, because a picture with odd sides cannot be converted to the
  // 4:2:0 colour the final film is written in.
  return `scale=trunc(iw*${scale}/2)*2:trunc(ih*${scale}/2)*2`
}

/**
 * Where the export's `overlay` puts the picture's top-left corner. At full
 * frame this is the centring it has always used.
 */
export function pictureOverlayPosition(clip: Placed) {
  if (clipScale(clip) >= MAX_CLIP_SCALE) {
    return { x: "(W-w)/2", y: "(H-h)/2" }
  }
  return {
    x: `W*${clip.x ?? 0.5}-w/2`,
    y: `H*${clip.y ?? 0.5}-h/2`,
  }
}
