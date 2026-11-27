import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminPost, userGet } from "@/server/guards"
import {
  retrySavedVideo,
  type SavedVideoDetail,
} from "@/server/video/viral/saved-videos"
import {
  loadVideoSource,
  type ProjectSourceDetail,
} from "@/server/video/viral/video-source"

/**
 * The editor's Copy panel: the viral video a video copies, and Try again when
 * its download or breakdown failed (`workspace/docs/project-first.md`).
 */

export type { ProjectSourceDetail, SavedVideoDetail }

const describeSavedVideoError = createErrorMessage(
  {
    SAVED_VIDEO_NOT_FOUND: "That saved video is gone.",
    SAVED_VIDEO_NOT_FAILED: "That video is not waiting to be tried again.",
    AI_LIMIT_REACHED:
      "Your AI allowance is used up, so nothing new can be broken down until next month.",
  },
  "That did not work. Try again in a moment."
)

export function getSavedVideoErrorMessage(error: unknown) {
  return describeSavedVideoError(error)
}

const videoId = z.string().min(1).max(36)

const retryFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: videoId }))
  .handler(
    async ({ data, context }): Promise<SavedVideoDetail> =>
      retrySavedVideo(context.user.id, data.id)
  )

/** Puts a failed video back in the queue. */
export function retryVideo(id: string) {
  return retryFn({ data: { id } })
}

const sourceFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ videoId }))
  .handler(
    async ({ data, context }): Promise<ProjectSourceDetail> =>
      loadVideoSource(context.user.id, data.videoId)
  )

/** The video's Copy panel: the viral video it copies, if any. */
export function loadVideoSourceDetail(videoId: string) {
  return sourceFn({ data: { videoId } })
}
