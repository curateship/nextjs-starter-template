/**
 * How a visual clip meets a frame it is not the same shape as.
 *
 * `contain` shrinks the picture until the whole of it is inside the frame,
 * which leaves black above and below a wide clip in a tall project. `cover`
 * grows it until the frame is full and cuts off whatever hangs over the edge.
 *
 * Absent means `contain`, so every timeline saved before this setting existed
 * reads and renders exactly as it did.
 *
 * This module is the one place the three ends agree: the schema takes the
 * values from here, the export builds its ffmpeg filter here, and the preview
 * picks its CSS here. Only video and image clips have a picture to fit; audio
 * and text do not.
 */

export const CLIP_FITS = ["contain", "cover"] as const
export type ClipFit = (typeof CLIP_FITS)[number]

const DEFAULT_CLIP_FIT: ClipFit = "contain"

/** What this clip is set to, with anything unset or unknown reading as fit. */
export function clipFit(clip: { fit?: string }): ClipFit {
  return clip.fit === "cover" ? "cover" : DEFAULT_CLIP_FIT
}

/** The value to store, or nothing when it is the default one. */
export function storedClipFit(fit: ClipFit): ClipFit | undefined {
  return fit === DEFAULT_CLIP_FIT ? undefined : fit
}

/** The inspector's two choices, in the order they are shown. */
export const CLIP_FIT_OPTIONS: { id: ClipFit; label: string }[] = [
  { id: "contain", label: "Fit inside" },
  { id: "cover", label: "Fill the frame" },
]

/**
 * The ffmpeg stage that sizes one picture to the frame.
 *
 * Filling needs two steps, not one. `increase` grows the picture until both
 * sides reach the frame, which leaves one side longer than the frame, and
 * `crop` then takes the middle of it back to the exact frame.
 *
 * The crop is not decoration. A still frame is the same either way, because
 * the overlay that draws the picture clips whatever hangs past the film. The
 * slide transition is not: its `x` expression in render.ts is measured from
 * the picture's own width, so an oversized width makes the slide travel 2246
 * pixels in the time it should travel 1080. Measured halfway through a slide
 * into a filled 16:9 clip in a 1080x1920 project, the cropped picture covers
 * 540 of the 1080 columns and the uncropped one already covers all 1080, so
 * the slide looks finished when it is half done.
 */
export function frameFitFilter(
  fit: ClipFit,
  width: number,
  height: number
): string {
  if (fit === "cover") {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease`
}
