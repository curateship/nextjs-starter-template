/**
 * The words and shapes of a saved viral video, the one an editor video
 * copies. Pure data, in `lib/` because both halves need it: the server fills
 * these in and the editor's Copy panel draws them.
 */

/** Where a saved video was posted. The three yt-dlp is allowed to read. */
export type SavedVideoPlatform = "youtube" | "tiktok" | "instagram"

/**
 * What a saved video's job is doing. `waiting` is a row nobody has picked up
 * yet; `downloaded` is in the media library with no AI run; `ready` has a
 * breakdown; `failed` keeps its reason and can be tried again.
 */
export type SavedVideoStatus =
  | "waiting"
  | "downloading"
  | "downloaded"
  | "analysing"
  | "ready"
  | "failed"

/** The line the Copy panel shows while the job moves. */
export const savedVideoStatusLabels: Record<SavedVideoStatus, string> = {
  waiting: "Waiting",
  downloading: "Downloading",
  downloaded: "Downloaded",
  analysing: "Watching it",
  ready: "Broken down",
  failed: "Failed",
}

/** True while the job is still moving, so the Copy panel keeps asking. */
export function isSavedVideoWorking(status: SavedVideoStatus): boolean {
  return status === "waiting" || status === "downloading" || status === "analysing"
}
