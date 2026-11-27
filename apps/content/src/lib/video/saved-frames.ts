/**
 * A frame kept as a picture: one moment of a project or of a finished export,
 * saved into the media library at full size (see
 * `workspace/docs/saved-frames.md`).
 */

export const FRAME_FAILED_MESSAGE =
  "That moment could not be turned into a picture"
export const FRAME_BUSY_MESSAGE =
  "A picture is already being saved. Try again once it has finished."

/**
 * What a saved frame is called in the library: the project, then the moment,
 * such as "Summer trip at 1m 05.4s". Written without a colon because the
 * library keeps only letters, digits, spaces, dots, dashes and underscores
 * in a file name.
 */
export function savedFrameName(projectName: string, atMs: number) {
  const tenths = Math.round(Math.max(0, atMs) / 100)
  const minutes = Math.floor(tenths / 600)
  const seconds = ((tenths % 600) / 10).toFixed(1)
  const moment = minutes
    ? `${minutes}m ${seconds.padStart(4, "0")}s`
    : `${seconds}s`
  return `${projectName.trim() || "Video"} at ${moment}`
}
