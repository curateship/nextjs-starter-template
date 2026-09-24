import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import {
  EXPORT_DESCRIPTION_MAX,
  EXPORT_TITLE_MAX,
  NO_ACTIVE_EXPORT_MESSAGE,
  NO_SHAPE_MESSAGE,
  NOTHING_TO_EXPORT_MESSAGE,
  ONLY_FAILED_RETRY_MESSAGE,
  QUEUE_FULL_MESSAGE,
  RENDER_NOT_FOUND_MESSAGE,
  shapeBusyMessage,
  TIMELINE_TOO_LONG_MESSAGE,
  type RenderFrameRate,
} from "@/lib/video/render"
import { FRAME_FAILED_MESSAGE } from "@/lib/video/saved-frames"
import {
  ASPECT_RATIOS,
  SAVED_TIMELINE_INVALID_MESSAGE,
  type AspectRatio,
} from "@/lib/video/timeline-schema"
import { userGet, userPost } from "@/server/guards"
import {
  deleteOwnedExports,
  listOwnedExports,
  setOwnedExportCover,
  updateOwnedExport,
  type ExportListResponse,
} from "@/server/video/exports"
import { listLiveSharedExportIds } from "@/server/video/export-shares"
import {
  cancelRenderJobs,
  enqueueRenderJobs,
  getLatestRenderJobs,
  retryRenderJob,
  type RenderJobSummary,
} from "@/server/video/render-queue"

/**
 * Exports: asking for one, watching it, and everything in the gallery
 * afterwards. All of it is per-person — an export belongs to whoever made it,
 * and every one of these carries that from the session rather than the request.
 */

export type { ExportListResponse, RenderJobSummary }

/** The gallery page, plus which of its exports a share link opens right now. */
export type ExportListWithShares = ExportListResponse & { shared_ids: string[] }

const KNOWN_MESSAGES = new Set([
  FRAME_FAILED_MESSAGE,
  PROJECT_NOT_FOUND_MESSAGE,
  RENDER_NOT_FOUND_MESSAGE,
  NOTHING_TO_EXPORT_MESSAGE,
  TIMELINE_TOO_LONG_MESSAGE,
  NO_ACTIVE_EXPORT_MESSAGE,
  QUEUE_FULL_MESSAGE,
  SAVED_TIMELINE_INVALID_MESSAGE,
  NO_SHAPE_MESSAGE,
  ONLY_FAILED_RETRY_MESSAGE,
  ...ASPECT_RATIOS.map(shapeBusyMessage),
])

export function getExportErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  return describeAuthError(message) ?? "The export could not be made."
}

const projectIdSchema = z.object({
  projectId: z.string().min(1).max(36),
})

const exportIdSchema = z.object({
  exportId: z.string().min(1).max(36),
})

const startSchema = projectIdSchema.extend({
  // No lower limit here, so an empty list reaches the queue and is refused
  // with its own plain message rather than a validation error.
  aspects: z.array(z.enum(ASPECT_RATIOS)).max(ASPECT_RATIOS.length),
  quality: z.enum(["high", "medium", "low"]),
  frameRate: z.union([z.literal(30), z.literal(60)]),
  // Absent means "whatever the brand kit says"; the modal can override it for
  // one export without changing the setting.
  normalizeLoudness: z.boolean().optional(),
  // Absent, or nothing but spaces, means the project's own name.
  title: z.string().max(EXPORT_TITLE_MAX).optional(),
})

const startExportFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(startSchema)
  .handler(async ({ data, context }) => {
    return enqueueRenderJobs({
      userId: context.user.id,
      projectId: data.projectId,
      aspects: data.aspects,
      quality: data.quality,
      frameRate: data.frameRate,
      normalizeLoudness: data.normalizeLoudness,
      title: data.title,
    })
  })

const projectExportFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(projectIdSchema)
  .handler(async ({ data, context }) => {
    return getLatestRenderJobs(context.user.id, data.projectId)
  })

const cancelExportFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdSchema)
  .handler(async ({ data, context }) => {
    return cancelRenderJobs(context.user.id, data.projectId)
  })

const retryExportFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(exportIdSchema)
  .handler(async ({ data, context }) => {
    return retryRenderJob(context.user.id, data.exportId)
  })

const listExportsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z
      .object({
        page: z.number().int().optional(),
        pageSize: z.number().int().optional(),
        search: z.string().trim().max(120).default(""),
      })
      .optional()
  )
  .handler(async ({ data, context }): Promise<ExportListWithShares> => {
    const list = await listOwnedExports({
      userId: context.user.id,
      page: data?.page ?? 1,
      pageSize: data?.pageSize ?? 24,
      search: data?.search,
    })
    const sharedIds = await listLiveSharedExportIds(
      context.user.id,
      list.exports.map((item) => item.id)
    )
    return { ...list, shared_ids: sharedIds }
  })

const updateExportFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    exportIdSchema.extend({
      title: z.string().max(EXPORT_TITLE_MAX),
      description: z.string().max(EXPORT_DESCRIPTION_MAX),
    })
  )
  .handler(async ({ data, context }) => {
    return updateOwnedExport({
      userId: context.user.id,
      exportId: data.exportId,
      title: data.title,
      description: data.description,
    })
  })

const setExportCoverFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    exportIdSchema.extend({ atMs: z.number().nonnegative().finite() })
  )
  .handler(async ({ data, context }) => {
    return setOwnedExportCover({
      userId: context.user.id,
      exportId: data.exportId,
      atMs: data.atMs,
    })
  })

const deleteExportsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ exportIds: z.array(z.string().min(1).max(36)).min(1).max(100) })
  )
  .handler(async ({ data, context }) => {
    return deleteOwnedExports(context.user.id, data.exportIds)
  })

export function startExport(
  projectId: string,
  aspects: AspectRatio[],
  quality: "high" | "medium" | "low",
  frameRate: RenderFrameRate,
  normalizeLoudness?: boolean,
  title?: string
) {
  return startExportFn({
    data: { projectId, aspects, quality, frameRate, normalizeLoudness, title },
  })
}

export function loadProjectExports(projectId: string) {
  return projectExportFn({ data: { projectId } })
}

export function cancelExports(projectId: string) {
  return cancelExportFn({ data: { projectId } })
}

export function retryExport(exportId: string) {
  return retryExportFn({ data: { exportId } })
}

export function listExports({
  page = 1,
  pageSize = 24,
  search,
}: { page?: number; pageSize?: number; search?: string } = {}) {
  return listExportsFn({ data: { page, pageSize, search } })
}

export function updateExport(
  exportId: string,
  title: string,
  description: string
) {
  return updateExportFn({ data: { exportId, title, description } })
}

export function setExportCover(exportId: string, atMs: number) {
  return setExportCoverFn({ data: { exportId, atMs } })
}

export function deleteExports(exportIds: string[]) {
  return deleteExportsFn({ data: { exportIds } })
}
