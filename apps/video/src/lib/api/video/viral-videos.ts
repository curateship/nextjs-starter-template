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
  saveVideo,
  type SavedVideoDetail,
} from "@/server/video/viral/saved-videos"
import {
  deleteSavedVideos,
  savedVideoDeleteSummary,
  type SavedVideoDeleteResult,
  type SavedVideoDeleteSummary,
} from "@/server/video/viral/delete-saved-videos"

/**
 * Saving a video, reading its breakdown, and deleting it.
 *
 * Pressing Download or AI analyse writes a row and returns straight away; the
 * work happens in the background worker. That is why there is a separate read
 * below — the panel asks again every few seconds while the job is moving.
 */

export type {
  ProjectSourceDetail,
  SavedVideoDeleteResult,
  SavedVideoDeleteSummary,
  SavedVideoDetail,
}

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
      /** False is Download: the file only, no AI. */
      analyse: z.boolean(),
    })
  )
  .handler(async ({ data, context }): Promise<SavedVideoDetail[]> => {
    // Pressed in a Viral project: it must be the caller's, because its id is
    // written onto the row. AI analyse checks its spend limit first, and the
    // breakdowns' AI cost is counted against it. Download spends no AI, so it
    // is never refused by a spend limit.
    if (data.viralProjectId) {
      const project = await requireOwnedViralProject(
        context.user.id,
        data.viralProjectId
      )
      if (data.analyse) {
        await requireViralProjectBudget(
          context.user.id,
          project.id,
          project.spendLimitCents,
          0
        )
      }
    }
    const saved: SavedVideoDetail[] = []
    for (const url of data.urls) {
      saved.push(
        await saveVideo(context.user.id, url, data.viralProjectId, data.analyse)
      )
    }
    return saved
  })

/**
 * Download (`analyse` false) or AI analyse (`analyse` true) for several
 * videos in one request, handing back the ones already saved. Pressing twice
 * never makes two rows.
 */
export function saveVideos(
  urls: string[],
  viralProjectId: string | null,
  analyse: boolean
) {
  return saveFn({ data: { urls, viralProjectId, analyse } })
}

const deleteSummaryFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ ids: z.array(videoId).min(1).max(100) }))
  .handler(
    async ({ data, context }): Promise<SavedVideoDeleteSummary> =>
      savedVideoDeleteSummary(context.user.id, data.ids)
  )

/** What deleting these saved videos touches, for the delete window. */
export function loadSavedVideoDeleteSummary(ids: string[]) {
  return deleteSummaryFn({ data: { ids } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(videoId).min(1).max(100) }))
  .handler(
    async ({ data, context }): Promise<SavedVideoDeleteResult> =>
      deleteSavedVideos(context.user.id, data.ids)
  )

/** Deletes saved videos, their breakdowns, covers and unused files. */
export function deleteSavedVideosFn(ids: string[]) {
  return deleteFn({ data: { ids } })
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
