import { RENDER_NOT_FOUND_MESSAGE } from "@/lib/video/render"
import {
  FRAME_BUSY_MESSAGE,
  FRAME_FAILED_MESSAGE,
  savedFrameName,
} from "@/lib/video/saved-frames"
import {
  discardGeneratedAsset,
  saveGeneratedAsset,
} from "@/server/video/asset-factories/media"
import { getOwnedExport } from "@/server/video/exports"
import { attachMediaToScope } from "@/server/video/media-list"
import { getOwnedVideo } from "@/server/video/project-videos"
import {
  extractCoverFrameFromStorage,
  renderTimelineFrame,
  SAFE_RENDER_ERRORS,
} from "@/server/video/render"

/**
 * Keeping one frame as a picture (see `workspace/docs/saved-frames.md`). Both
 * ways in end the same: an ordinary image in the media library, on the
 * project's shelf, named after the project and the moment.
 */

export type SavedFrame = { media_id: string; name: string }

/**
 * One picture at a time per person. Each one downloads the video files it
 * needs and runs ffmpeg inside the request; letting somebody start ten at once
 * helps nobody.
 */
const busyWith = new Set<string>()

async function oneAtATime<T>(userId: string, work: () => Promise<T>) {
  if (busyWith.has(userId)) throw new Error(FRAME_BUSY_MESSAGE)
  busyWith.add(userId)
  try {
    return await work()
  } finally {
    busyWith.delete(userId)
  }
}

async function keepFrame({
  userId,
  projectId,
  name,
  bytes,
}: {
  userId: string
  projectId: string
  name: string
  bytes: Uint8Array
}): Promise<SavedFrame> {
  const media = await saveGeneratedAsset({
    userId,
    bytes,
    mimeType: "image/jpeg",
    fileType: "image",
    name,
  })
  try {
    await attachMediaToScope(userId, { type: "project", id: projectId }, media.id)
  } catch (error) {
    await discardGeneratedAsset(media)
    throw error
  }
  // The name as the library stored it, which drops brackets and the like, so
  // the confirmation matches the tile in the media panel.
  return { media_id: media.id, name: media.originalName.replace(/\.jpg$/, "") }
}

/**
 * One frame of a finished export, at the export's own size. It is taken from
 * the file, so it is exactly what somebody watching the export sees.
 */
export async function saveOwnedExportFrame({
  userId,
  exportId,
  atMs,
}: {
  userId: string
  exportId: string
  atMs: number
}): Promise<SavedFrame> {
  const row = await getOwnedExport(userId, exportId)
  // A carousel export has no video and no moments to take a frame from.
  const videoId = row.videoId
  if (row.status !== "ready" || !row.storagePath || !videoId) {
    throw new Error(RENDER_NOT_FOUND_MESSAGE)
  }
  const storagePath = row.storagePath
  const video = await getOwnedVideo(userId, videoId)

  // The slider runs to the very end, where there is no frame left to take.
  const lastFrameMs = Math.max(0, (row.durationMs ?? 0) - 1000 / row.frameRate)
  const momentMs = Math.min(atMs, lastFrameMs)
  return oneAtATime(userId, async () => {
    const bytes = await extractCoverFrameFromStorage(storagePath, momentMs, {
      fullSize: true,
    })
    if (!bytes) throw new Error(FRAME_FAILED_MESSAGE)

    return keepFrame({
      userId,
      projectId: video.projectId,
      name: savedFrameName(video.name, momentMs),
      bytes,
    })
  })
}

/**
 * The frame under the editor's playhead, drawn from the saved video at the
 * size a best-quality export would be. It goes on the project's media shelf.
 */
export async function saveOwnedVideoFrame({
  userId,
  videoId,
  atMs,
}: {
  userId: string
  videoId: string
  atMs: number
}): Promise<SavedFrame> {
  const video = await getOwnedVideo(userId, videoId)
  return oneAtATime(userId, async () => {
    let bytes: Uint8Array
    try {
      bytes = await renderTimelineFrame({
        userId,
        timeline: video.timeline,
        atMs,
      })
    } catch (error) {
      // A missing file or an empty project is worth saying as it is; ffmpeg's
      // own complaints go to the log.
      if (error instanceof Error && SAFE_RENDER_ERRORS.has(error.message)) {
        throw error
      }
      console.error("Saving a frame failed", error)
      throw new Error(FRAME_FAILED_MESSAGE)
    }

    return keepFrame({
      userId,
      projectId: video.projectId,
      name: savedFrameName(video.name, atMs),
      bytes,
    })
  })
}
