import { MAX_DURATION_SECONDS, MAX_FILE_BYTES, NOTE_SAYS } from "@/lib/note/videos"

/**
 * What the Upload button takes, checked in the browser before a byte is sent.
 *
 * Only video files for now. The shell's uploader refuses every sound file a
 * browser sends it, because its first-bytes check has no rule for sound, and
 * it caps sound at 50MB in one request rather than 500MB in pieces. Taking
 * sound needs that changed in the shell first (see
 * `workspace/docs/saving-a-video.md`).
 */
export const UPLOAD_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const

export const UPLOAD_ACCEPT = [...UPLOAD_TYPES, ".mp4", ".mov", ".webm"].join(",")

/** Why this file cannot be uploaded, or null when it can. */
export function uploadRefusal(file: File): string | null {
  if (!(UPLOAD_TYPES as readonly string[]).includes(file.type)) {
    return "Upload an mp4, mov or webm video."
  }
  if (file.size > MAX_FILE_BYTES) return NOTE_SAYS.uploadTooBig
  return null
}

/**
 * How long a picked file plays for, read by the browser from the file's own
 * header without sending it anywhere. Null when the browser cannot tell, in
 * which case the worker reads it after the upload instead.
 */
export function readFileDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const address = URL.createObjectURL(file)
    const media = document.createElement("video")
    let settled = false
    const finish = (seconds: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(giveUp)
      media.removeAttribute("src")
      URL.revokeObjectURL(address)
      resolve(seconds)
    }
    const giveUp = setTimeout(() => finish(null), 5_000)
    media.preload = "metadata"
    media.onloadedmetadata = () =>
      finish(Number.isFinite(media.duration) && media.duration > 0 ? media.duration : null)
    media.onerror = () => finish(null)
    media.src = address
  })
}

/** Over thirty minutes, said before the upload starts. */
export function tooLongToUpload(seconds: number | null) {
  return seconds !== null && seconds > MAX_DURATION_SECONDS
}
