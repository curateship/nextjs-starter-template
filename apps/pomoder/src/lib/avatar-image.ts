import { AVATAR_PIXELS } from "@/lib/avatar"

// Browser-side preparation of a picked file: centre-crop to a square, scale to
// the stored size and re-encode as JPEG. The server still checks the bytes it
// receives, but doing the crop here means the file that leaves the browser is
// already the square we display, so nothing large or oddly shaped is uploaded.

export const AVATAR_SOURCE_MAX_BYTES = 12 * 1024 * 1024

export async function cropToSquareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("AVATAR_NOT_AN_IMAGE")
  if (file.size > AVATAR_SOURCE_MAX_BYTES) throw new Error("AVATAR_SOURCE_TOO_LARGE")
  const source = await createImageBitmap(file).catch(() => {
    throw new Error("AVATAR_NOT_AN_IMAGE")
  })
  try {
    const edge = Math.min(source.width, source.height)
    if (!edge) throw new Error("AVATAR_NOT_AN_IMAGE")
    const size = Math.min(AVATAR_PIXELS, edge)
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")
    if (!context) throw new Error("AVATAR_CROP_FAILED")
    // JPEG has no transparency, so fill first: a transparent PNG would
    // otherwise come out with a black square behind it.
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, size, size)
    context.drawImage(source, (source.width - edge) / 2, (source.height - edge) / 2, edge, edge, 0, 0, size, size)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("AVATAR_CROP_FAILED"))), "image/jpeg", 0.9)
    })
  } finally {
    source.close()
  }
}
