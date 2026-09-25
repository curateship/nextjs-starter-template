/**
 * What a member may upload, in one browser-safe file.
 *
 * The file picker, the wording under it and the server all read these, so the
 * size a member is told about is the size the server enforces. Numbers are the
 * old app's (`apps/pomoder/src/server/pomoder-media.ts`): a file it accepted is
 * still accepted and one it refused is still refused.
 */

export type PomodoroUploadKind = "image" | "audio" | "video"
export type PomodoroUploadPurpose = "background" | "sound"

export const UPLOAD_LIMIT_BYTES: Record<PomodoroUploadKind, number> = {
  image: 10 * 1024 * 1024,
  audio: 30 * 1024 * 1024,
  video: 100 * 1024 * 1024,
}

export function uploadLimitBytes(kind: PomodoroUploadKind) {
  return UPLOAD_LIMIT_BYTES[kind]
}

/** The six types, by the name the byte sniffing gives each one. */
export const POMODORO_UPLOAD_TYPES = {
  png: { kind: "image", mimeType: "image/png", extension: "png" },
  jpeg: { kind: "image", mimeType: "image/jpeg", extension: "jpg" },
  webp: { kind: "image", mimeType: "image/webp", extension: "webp" },
  mp3: { kind: "audio", mimeType: "audio/mpeg", extension: "mp3" },
  wav: { kind: "audio", mimeType: "audio/wav", extension: "wav" },
  ogg: { kind: "audio", mimeType: "audio/ogg", extension: "ogg" },
  mp4: { kind: "video", mimeType: "video/mp4", extension: "mp4" },
  webm: { kind: "video", mimeType: "video/webm", extension: "webm" },
} as const satisfies Record<
  string,
  { kind: PomodoroUploadKind; mimeType: string; extension: string }
>

/** What the file picker offers for each purpose. */
export const UPLOAD_ACCEPT: Record<PomodoroUploadPurpose, string> = {
  background: "image/png,image/jpeg,image/webp,video/mp4,video/webm",
  sound: "audio/mpeg,audio/wav,audio/ogg",
}

/** The line under the button, so the rules are read before a file is picked. */
export const UPLOAD_HINT: Record<PomodoroUploadPurpose, string> = {
  background: "PNG, JPG or WebP up to 10 MB, MP4 or WebM up to 100 MB.",
  sound: "MP3, WAV or OGG up to 30 MB.",
}

/** "1.4 GB", for the space-used line. Whole units, because nobody counts bytes. */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
