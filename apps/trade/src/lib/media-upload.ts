/**
 * The upload rules the browser checks before sending a file.
 *
 * These mirror `validateMediaFile` in `server/media.ts`, which is still the one
 * that decides. Checking here only saves someone a 100MB round trip to be told
 * no, so the wording matches on both sides.
 */
import { formatFileSize } from "@/lib/format-bytes"

export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]

export const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
]

const IMAGE_MAX_BYTES = 10 * 1024 * 1024
const VIDEO_MAX_BYTES = 100 * 1024 * 1024

/** What to hand a file input's `accept`, so the picker only offers valid files. */
export function mediaAccept(allowVideo: boolean) {
  const types = allowVideo
    ? [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES]
    : IMAGE_MIME_TYPES
  return types.join(",")
}

/** Why this file would be refused, or null when it is fine to send. */
export function getMediaUploadError(file: File, allowVideo: boolean) {
  const isImage = IMAGE_MIME_TYPES.includes(file.type)
  const isVideo = allowVideo && VIDEO_MIME_TYPES.includes(file.type)

  if (!isImage && !isVideo) {
    return allowVideo
      ? "Invalid file type. Only images (JPEG, PNG, GIF, WebP, SVG) and videos (MP4, WebM, MOV, AVI, MKV) are allowed."
      : "Invalid file type. Only images (JPEG, PNG, GIF, WebP, SVG) are allowed."
  }

  const maximumSize = isImage ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES
  if (file.size > maximumSize) {
    return `File size too large. Maximum size is ${formatFileSize(maximumSize)}.`
  }

  return null
}

/**
 * A video address that paints its first frame instead of a black box.
 *
 * `#t=0.1` is a media fragment: the browser reads the video's header, asks for
 * the tenth-of-a-second mark with a range request, and paints that frame. It is
 * why no poster image has to be stored anywhere. Without it Safari shows an
 * empty square until someone presses play.
 */
export function videoPosterSrc(url: string) {
  return `${url.split("#")[0]}#t=0.1`
}
