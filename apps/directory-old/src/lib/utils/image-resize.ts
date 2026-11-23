// Shrinks images in the browser before they are uploaded.
//
// Nothing resizes images anywhere in this app — next/image used to do it and
// the TanStack port had no equivalent to carry it to, so whatever pixels an
// admin drags in are the pixels every visitor downloads forever. Live listing
// images were 330 KB PNGs rendering at roughly a third of the viewport.
//
// Doing this at upload time rather than on the server keeps it free: the
// browser has already decoded the image, and we avoid putting a native image
// library inside an Alpine container. The trade-off is that we store one
// correctly sized file rather than a per-breakpoint set, which is the bulk of
// the win without any server-side cost.

/** Above this, detail is wasted for any layout this app renders. */
const MAX_DIMENSION = 1600

/** WebP quality. 0.82 is visually indistinguishable here at a fraction of PNG. */
const WEBP_QUALITY = 0.82

/**
 * Formats worth re-encoding. SVG is vector (resizing is meaningless and would
 * rasterise it), and GIF may be animated — canvas would silently flatten it to
 * the first frame.
 */
const RESIZABLE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])

export function canResizeImage(file: File) {
  return RESIZABLE_TYPES.has(file.type)
}

function targetSize(width: number, height: number) {
  const longest = Math.max(width, height)
  if (longest <= MAX_DIMENSION) return { width, height }

  const scale = MAX_DIMENSION / longest
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

async function decode(file: File) {
  // createImageBitmap decodes off the main thread where available.
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file)
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("Could not decode image"))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Returns a smaller WebP version of `file`, or the original file unchanged when
 * resizing is not possible or not worth it.
 *
 * Never throws: an upload failing because we could not shrink it would be a
 * worse outcome than uploading the original, so every failure path falls back.
 */
export async function resizeImageForUpload(file: File): Promise<File> {
  if (!canResizeImage(file)) return file
  if (typeof document === "undefined") return file

  try {
    const source = await decode(file)
    const sourceWidth = "width" in source ? source.width : 0
    const sourceHeight = "height" in source ? source.height : 0
    if (!sourceWidth || !sourceHeight) return file

    const { width, height } = targetSize(sourceWidth, sourceHeight)

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext("2d")
    if (!context) return file

    context.drawImage(source as CanvasImageSource, 0, 0, width, height)
    if ("close" in source && typeof source.close === "function") source.close()

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY)
    )
    if (!blob) return file

    // A re-encode that saved nothing is not worth the format change — some
    // already-optimised images come out larger as WebP.
    if (blob.size >= file.size) return file

    return new File([blob], toWebpName(file.name), {
      type: "image/webp",
      lastModified: file.lastModified,
    })
  } catch {
    return file
  }
}

function toWebpName(name: string) {
  return name.replace(/\.[^./\\]+$/, "") + ".webp"
}
