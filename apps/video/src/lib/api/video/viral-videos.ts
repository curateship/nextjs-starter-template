import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { getViralErrorMessage } from "./viral"
import { isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import { VIRAL_SAYS } from "@/lib/video/viral"
import { adminGet, adminPost, userGet } from "@/server/guards"
import type { ProjectItem } from "@/server/video/projects"
import { requireViralProjectBudget } from "@/server/video/project-spend"
import { requireOwnedViralProject } from "@/server/video/viral/projects"
import {
  copyVideoIntoProject,
  loadProjectSource,
  type ProjectSourceDetail,
} from "@/server/video/viral/copy-into-project"
import {
  listSavedVideoStatuses,
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

const describeSavedVideoError = createErrorMessage(
  {
    SAVED_VIDEO_NOT_FOUND: "That saved video is gone.",
    SAVED_VIDEO_NOT_FAILED: "That video is not waiting to be tried again.",
    "Project not found": "That project is gone.",
    AI_LIMIT_REACHED:
      "Your AI allowance is used up, so nothing new can be broken down until next month.",
  },
  "That did not work. Try again in a moment."
)

/** A Viral project's own refusals (its spend limit, a gone project) pass through. */
export function getSavedVideoErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message.includes(VIRAL_SAYS) || isProjectSpendLimitMessage(message)) {
    return getViralErrorMessage(error)
  }
  return describeSavedVideoError(error)
}

const videoId = z.string().min(1).max(36)

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      urls: z.array(z.string().min(1).max(2048)).min(1).max(100),
      viralProjectId: videoId.nullable(),
    })
  )
  .handler(async ({ data, context }): Promise<SavedVideoDetail[]> => {
    // Pressed in a Viral project: its spend limit is checked first, and the
    // breakdowns' AI cost is counted against it.
    if (data.viralProjectId) {
      const project = await requireOwnedViralProject(
        context.user.id,
        data.viralProjectId
      )
      await requireViralProjectBudget(
        context.user.id,
        project.id,
        project.spendLimitCents,
        0
      )
    }
    const saved: SavedVideoDetail[] = []
    for (const url of data.urls) {
      saved.push(
        await saveVideoForBreakdown(context.user.id, url, data.viralProjectId)
      )
    }
    return saved
  })

/**
 * Saves videos for breaking down, or hands back the ones already saved, in
 * one request. Pressing twice never makes two rows.
 */
export function saveVideos(urls: string[], viralProjectId: string | null) {
  return saveFn({ data: { urls, viralProjectId } })
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

const statusesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ ids: z.array(videoId).min(1).max(100) }))
  .handler(async ({ data, context }) =>
    listSavedVideoStatuses(context.user.id, data.ids)
  )

/** Where several saved videos have got to, for the cards that show it. */
export function loadSavedVideoStatuses(ids: string[]) {
  return statusesFn({ data: { ids } })
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
      viralProjectId: videoId.nullable(),
    })
  )
  .handler(
    async ({ data, context }): Promise<ProjectItem> =>
      copyVideoIntoProject(
        context.user.id,
        data.url,
        data.title,
        data.viralProjectId
      )
  )

/**
 * Copy this: saves the video for breaking down and makes a new project that
 * copies it, remembering the Viral project it was pressed in. Pressing twice
 * makes two projects and one download.
 */
export function copyIntoProject(
  url: string,
  title: string | null,
  viralProjectId: string | null
) {
  return copyFn({ data: { url, title, viralProjectId } })
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
