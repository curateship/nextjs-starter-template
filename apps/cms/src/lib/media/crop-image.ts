/**
 * Turning a crop selection into a real file, entirely in the browser.
 *
 * The cropped file then rides the existing upload pipeline untouched, so the
 * server's type, size, and magic-byte checks still have the final say.
 */

/**
 * The raster formats a canvas can re-encode faithfully. GIFs are left out on
 * purpose: a canvas keeps only one frame, so cropping an animated GIF would
 * silently freeze it. SVGs are drawings, not pixels, so they skip the crop
 * step entirely.
 */
const CROPPABLE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]

/** Whether the crop step should be offered for this file at all. */
export function isCroppableImage(file: File) {
  return CROPPABLE_IMAGE_MIME_TYPES.includes(file.type)
}

/**
 * The hard ceiling on the saved image's longest side, whatever "max size" says.
 * Browsers cap canvases near this size and silently paint nothing past it.
 */
const CROP_OUTPUT_HARD_LIMIT = 8192

export type CropRegion = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Shrink a size so its longest side fits the cap (and the hard ceiling).
 *
 * When a fixed shape (`aspect`, width ÷ height) is locked, the height is
 * derived from the width so rounding can never leave a "square" one pixel off
 * square — the on-screen selection is measured in whole screen pixels, and
 * mapping those back to the photo's real resolution rounds each side on its
 * own.
 */
export function scaledSize(
  width: number,
  height: number,
  maxDimension: number | null,
  aspect?: number | null
) {
  const limit = Math.min(maxDimension ?? Infinity, CROP_OUTPUT_HARD_LIMIT)
  const shrink = Math.min(1, limit / Math.max(width, height))
  const outWidth = Math.max(1, Math.round(width * shrink))
  return {
    width: outWidth,
    height: aspect
      ? Math.max(1, Math.round(outWidth / aspect))
      : Math.max(1, Math.round(height * shrink)),
  }
}

/**
 * The pixel size the saved image will come out at: the selection mapped back
 * to the photo's real resolution, then shrunk if it beats the size cap.
 */
function cropOutputSize(
  image: HTMLImageElement,
  crop: CropRegion,
  maxDimension: number | null,
  aspect?: number | null
) {
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height
  return scaledSize(
    Math.max(1, Math.round(crop.width * scaleX)),
    Math.max(1, Math.round(crop.height * scaleY)),
    maxDimension,
    aspect
  )
}

/**
 * Draw the selected region onto a canvas at the output size and hand back a
 * File with the original's name and format, ready for the normal upload.
 */
export async function cropImageToFile(options: {
  image: HTMLImageElement
  file: File
  /** The selection, in on-screen pixels of the displayed image. */
  crop: CropRegion
  /** Cap on the longest side of the saved image, or null for full size. */
  maxDimension: number | null
  /** The locked shape (width ÷ height), or null when the crop was free. */
  aspect?: number | null
}): Promise<File> {
  const { image, file, crop, maxDimension, aspect } = options

  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height
  const sourceX = Math.max(0, crop.x * scaleX)
  const sourceY = Math.max(0, crop.y * scaleY)
  const sourceWidth = Math.min(
    image.naturalWidth - sourceX,
    crop.width * scaleX
  )
  const sourceHeight = Math.min(
    image.naturalHeight - sourceY,
    crop.height * scaleY
  )

  const output = cropOutputSize(image, crop, maxDimension, aspect)
  const canvas = document.createElement("canvas")
  canvas.width = output.width
  canvas.height = output.height

  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("This browser could not prepare the image for cropping.")
  }
  context.imageSmoothingQuality = "high"
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    output.width,
    output.height
  )

  // "image/jpg" is a nonstandard alias some systems send; canvases only know
  // the real name.
  const outputType = file.type === "image/jpg" ? "image/jpeg" : file.type
  const blob = await new Promise<Blob | null>((resolve) =>
    // JPEG and WebP take a quality knob; 0.92 keeps files light without
    // visible loss. PNG ignores the value.
    canvas.toBlob(resolve, outputType, 0.92)
  )
  if (!blob) {
    throw new Error("The cropped image could not be saved. Try a smaller crop.")
  }

  return new File([blob], file.name, { type: outputType })
}
