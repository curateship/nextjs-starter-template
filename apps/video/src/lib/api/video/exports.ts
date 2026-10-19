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
import {
  CLEAR_OUT_AGE_VALUES,
  clearOutCutoff,
  type ClearOutAgeChoice,
} from "@/lib/video/export-clear-out"
import { EXPORT_KINDS, type ExportKind } from "@/lib/video/export-kinds"
import { FRAME_FAILED_MESSAGE } from "@/lib/video/saved-frames"
import {
  ASPECT_RATIOS,
  SAVED_TIMELINE_INVALID_MESSAGE,
  type AspectRatio,
} from "@/lib/video/timeline-schema"
import { userGet, userPost } from "@/server/guards"
import {
  clearOutOldExports,
  previewExportClearOut,
} from "@/server/video/export-clear-out"
import {
  deleteOwnedExports,
  listOwnedExports,
  setOwnedExportCover,
  updateOwnedExport,
  type ExportListResponse,
} from "@/server/video/exports"
import { listLiveSharedExportIds } from "@/server/video/export-shares"
import {
  cancelRenderJob,
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
export type ExportListWithShares = ExportListResponse & {
  shared_ids: string[]
}

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
  // Absent means evened out (DEFAULT_NORMALIZE_LOUDNESS). The Export window
  // always sends its own switch.
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

const stopExportFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(exportIdSchema)
  .handler(async ({ data, context }) => {
    return cancelRenderJob(context.user.id, data.exportId)
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
        projectId: z.string().min(1).max(36).optional(),
        kind: z.enum(EXPORT_KINDS).default("video"),
      })
      .optional()
  )
  .handler(async ({ data, context }): Promise<ExportListWithShares> => {
    const list = await listOwnedExports({
      userId: context.user.id,
      page: data?.page ?? 1,
      pageSize: data?.pageSize ?? 24,
      search: data?.search,
      projectId: data?.projectId,
      kind: data?.kind ?? "video",
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
    z.object({
      exportIds: z.array(z.string().min(1).max(36)).min(1).max(100),
      kind: z.enum(EXPORT_KINDS).default("video"),
    })
  )
  .handler(async ({ data, context }) => {
    return deleteOwnedExports(
      context.user.id,
      data.exportIds,
      undefined,
      data.kind
    )
  })

const previewClearOutFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({
      age: z.enum(CLEAR_OUT_AGE_VALUES),
      kind: z.enum(EXPORT_KINDS).default("video"),
    })
  )
  .handler(async ({ data, context }) => {
    return previewExportClearOut(
      context.user.id,
      clearOutCutoff(data.age, new Date()),
      undefined,
      data.kind
    )
  })

const clearOutFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      // The cutoff the preview counted against, so the delete takes what the
      // window named rather than whatever has aged past the line since.
      before: z.iso.datetime(),
      includeShared: z.boolean(),
      kind: z.enum(EXPORT_KINDS).default("video"),
    })
  )
  .handler(async ({ data, context }) => {
    return clearOutOldExports({
      userId: context.user.id,
      before: new Date(data.before),
      includeShared: data.includeShared,
      kind: data.kind,
    })
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

/** Stops one export, leaving the project's other exports going. */
export function stopExport(exportId: string) {
  return stopExportFn({ data: { exportId } })
}

export function retryExport(exportId: string) {
  return retryExportFn({ data: { exportId } })
}

export function listExports({
  page = 1,
  pageSize = 24,
  search,
  projectId,
  kind = "video",
}: {
  page?: number
  pageSize?: number
  search?: string
  /** Only one project's, for that project's Exports tab. */
  projectId?: string
  /** Video exports, or kept carousel ZIPs for the Carousel exports page. */
  kind?: ExportKind
} = {}) {
  return listExportsFn({ data: { page, pageSize, search, projectId, kind } })
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

export function deleteExports(
  exportIds: string[],
  kind: ExportKind = "video"
) {
  return deleteExportsFn({ data: { exportIds, kind } })
}

export function previewClearOut(
  age: ClearOutAgeChoice,
  kind: ExportKind = "video"
) {
  return previewClearOutFn({ data: { age, kind } })
}

export function clearOutExports(
  before: string,
  includeShared: boolean,
  kind: ExportKind = "video"
) {
  return clearOutFn({ data: { before, includeShared, kind } })
}
