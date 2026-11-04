/**
 * The upload rules the browser checks before sending a file.
 *
 * These mirror `validateMediaFile` in `server/media/library.ts`, which is still the one
 * that decides. Checking here only saves someone a long upload just to be told
 * no, so the wording matches on both sides.
 */
import { appOptions } from "@/app/options"
import type { AppOptions } from "@/lib/app-options"
import { formatFileSize } from "@/lib/format/format-bytes"

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
const MB = 1024 * 1024
const GB = 1024 * MB

/**
 * 5GB, about 12 minutes of 4K at 60 frames a second from a phone. What every
 * app allows unless its `media.videoMaxBytes` option says otherwise.
 */
export const DEFAULT_VIDEO_MAX_BYTES = 5 * GB

/**
 * The most R2 keeps in one file sent in pieces: 5TB less 5GB. No app option
 * can go past it, because the bucket would refuse the join.
 */
export const BUCKET_MAX_VIDEO_BYTES = 5 * 1024 * GB - 5 * GB

/**
 * The biggest video this app takes, shared by the browser and the server,
 * which refuses anything bigger once the pieces are joined.
 */
export function videoMaxBytes(options: AppOptions = appOptions) {
  const chosen = options.media?.videoMaxBytes
  if (chosen === "bucket") return BUCKET_MAX_VIDEO_BYTES
  return Math.min(chosen ?? DEFAULT_VIDEO_MAX_BYTES, BUCKET_MAX_VIDEO_BYTES)
}

/**
 * Videos go straight to the bucket in pieces of at least this size. 10MB keeps
 * the number climbing often and makes a retried piece cheap.
 */
export const VIDEO_UPLOAD_MIN_PART_BYTES = 10 * MB

/** The bucket joins at most this many pieces into one file. */
export const VIDEO_UPLOAD_MAX_PARTS = 10_000

/**
 * How big each piece of a file this size is. 10MB up to about 100GB, then
 * whole megabytes big enough that 10,000 pieces still cover the file: a 500GB
 * file goes in 52MB pieces.
 */
export function videoUploadPartBytes(size: number) {
  const fitting = Math.ceil(size / VIDEO_UPLOAD_MAX_PARTS / MB) * MB
  return Math.max(VIDEO_UPLOAD_MIN_PART_BYTES, fitting)
}

/** How many pieces a file of this size is cut into. */
export function videoUploadPartCount(size: number) {
  return Math.max(1, Math.ceil(size / videoUploadPartBytes(size)))
}

/**
 * How many bytes one piece holds: the piece size for every piece but the
 * last, and whatever is left for the last.
 */
export function videoUploadPieceBytes(size: number, partNumber: number) {
  const partBytes = videoUploadPartBytes(size)
  const count = videoUploadPartCount(size)
  return partNumber < count ? partBytes : size - (count - 1) * partBytes
}

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

  const maximumSize = isImage ? IMAGE_MAX_BYTES : videoMaxBytes()
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
