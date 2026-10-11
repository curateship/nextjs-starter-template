/**
 * Pictures a task's Files card draws small, which the download address also
 * lets a browser show inside the page. Never SVG, which can carry script.
 * Every other file is only ever sent as a download.
 */
const SHOWN_PICTURES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])

export function isShownPicture(mimeType: string) {
  return SHOWN_PICTURES.has(mimeType)
}

/** The address a task's file downloads from, or shows from with `view`. */
export function taskFileHref(fileId: string, view = false) {
  return `/api/project/task-files/${encodeURIComponent(fileId)}${view ? "?view=1" : ""}`
}
