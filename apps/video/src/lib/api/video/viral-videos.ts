import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost, userGet } from "@/server/guards"
import type { ProjectItem } from "@/server/video/projects"
import {
  copyVideoIntoProject,
  loadProjectSource,
  type ProjectSourceDetail,
} from "@/server/video/viral/copy-into-project"
import {
  loadSavedVideo,
  retrySavedVideo,
  saveVideoForBreakdown,
  type SavedVideoDetail,
} from "@/server/video/viral/saved-videos"

/**
 * Saving a video and reading its breakdown.
 *
 * Pressing the button writes a row and returns straight away; the work happens
 * in the background worker. That is why there is a separate read below — the
 * panel asks again every few seconds while the job is moving.
 */

export type { ProjectSourceDetail, SavedVideoDetail }

export const getSavedVideoErrorMessage = createErrorMessage(
  {
    SAVED_VIDEO_NOT_FOUND: "That saved video is gone.",
    SAVED_VIDEO_NOT_FAILED: "That video is not waiting to be tried again.",
    "Project not found": "That project is gone.",
    AI_LIMIT_REACHED:
      "Your AI allowance is used up, so nothing new can be broken down until next month.",
  },
  "That did not work. Try again in a moment."
)

const videoId = z.string().min(1).max(36)

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ url: z.string().min(1).max(2048) }))
  .handler(
    async ({ data, context }): Promise<SavedVideoDetail> =>
      saveVideoForBreakdown(context.user.id, data.url)
  )

/**
 * Saves a video for breaking down, or hands back the one already saved.
 * Pressing twice never makes two rows.
 */
export function saveVideo(url: string) {
  return saveFn({ data: { url } })
}

const readFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: videoId }))
  .handler(
    async ({ data, context }): Promise<SavedVideoDetail> =>
      loadSavedVideo(context.user.id, data.id)
  )

/** The saved video's state, player address and breakdown. */
export function loadSavedVideoDetail(id: string) {
  return readFn({ data: { id } })
}

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

const copyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      url: z.string().min(1).max(2048),
      title: z.string().trim().max(200).nullable(),
    })
  )
  .handler(
    async ({ data, context }): Promise<ProjectItem> =>
      copyVideoIntoProject(context.user.id, data.url, data.title)
  )

/**
 * Copy this: saves the video for breaking down and makes a new project that
 * copies it. Pressing twice makes two projects and one download.
 */
export function copyIntoProject(url: string, title: string | null) {
  return copyFn({ data: { url, title } })
}

const sourceFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(
    async ({ data, context }): Promise<ProjectSourceDetail> =>
      loadProjectSource(context.user.id, data.projectId)
  )

/** The project's Copy tab: the viral video it copies, if any. */
export function loadProjectSourceDetail(projectId: string) {
  return sourceFn({ data: { projectId } })
}
