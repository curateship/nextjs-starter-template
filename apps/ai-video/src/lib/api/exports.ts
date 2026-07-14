import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  EXPORT_CAPTION_MAX_LENGTH,
  EXPORT_TITLE_MAX_LENGTH,
} from "@/lib/export-constraints"
import type {
  ExportCoverFrame,
  ExportCoverFramesResult,
  ExportDescriptionResult,
  ExportItem,
  ExportListResponse,
  ExportUpdateInput,
  GenerateExportCoverInput,
} from "@/server/exports"

export type {
  ExportCoverFrame,
  ExportCoverFramesResult,
  ExportDescriptionResult,
  ExportItem,
  ExportListResponse,
  ExportUpdateInput,
  GenerateExportCoverInput,
}

const exportSafeErrorMessages = new Set([
  "API usage limit reached. Try again next month.",
  "Export not found",
  "Export title is required",
  "Description generation is not configured",
  "Description generation returned no result",
  "Description generation returned invalid JSON",
  "Description generation returned an unexpected shape",
  "Cover font is missing on the server",
  "Cover frame extraction failed",
  "Cover generation failed",
  "Cover prompt is required",
  "Image generation failed",
  "Image generation did not return an image",
  "Image generation is not configured",
  "Image generation returned an empty image",
  "Image generation returned an image that is too large",
  "Image generation returned an invalid file type",
])

export function getExportErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Export request failed."
  if (exportSafeErrorMessages.has(error.message)) return error.message
  if (error.message.startsWith("Description generation failed")) {
    return error.message
  }
  return "Export request failed."
}

const projectIdSchema = z.object({ projectId: z.string().min(1).max(36) })
const coverTimeSchema = projectIdSchema.extend({
  timeSeconds: z.number().finite().min(0).max(900),
})

const listExportsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ExportListResponse> => {
    const { listExportsForCurrentUser } = await import("@/server/exports")
    return listExportsForCurrentUser()
  }
)

const getExportFn = createServerFn({ method: "GET" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<ExportItem> => {
    const { getExportForCurrentUser } = await import("@/server/exports")
    return getExportForCurrentUser(data.projectId)
  })

const generateExportDescriptionFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<ExportDescriptionResult> => {
    const { generateExportDescriptionForCurrentUser } =
      await import("@/server/exports")
    return generateExportDescriptionForCurrentUser(data.projectId)
  })

const updateExportFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      title: z.string().min(1).max(EXPORT_TITLE_MAX_LENGTH),
      caption: z.string().max(EXPORT_CAPTION_MAX_LENGTH),
    })
  )
  .handler(async ({ data }): Promise<ExportItem> => {
    const { updateExportForCurrentUser } = await import("@/server/exports")
    return updateExportForCurrentUser(data.projectId, {
      title: data.title,
      caption: data.caption,
    })
  })

const getExportCoverFramesFn = createServerFn({ method: "GET" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<ExportCoverFramesResult> => {
    const { getExportCoverFramesForCurrentUser } =
      await import("@/server/exports")
    return getExportCoverFramesForCurrentUser(data.projectId)
  })

const getExportCoverFrameFn = createServerFn({ method: "GET" })
  .inputValidator(coverTimeSchema)
  .handler(async ({ data }): Promise<ExportCoverFrame> => {
    const { getExportCoverFrameForCurrentUser } =
      await import("@/server/exports")
    return getExportCoverFrameForCurrentUser(data.projectId, data.timeSeconds)
  })

const saveExportFrameCoverFn = createServerFn({ method: "POST" })
  .inputValidator(coverTimeSchema)
  .handler(async ({ data }): Promise<ExportItem> => {
    const { saveExportFrameCoverForCurrentUser } =
      await import("@/server/exports")
    return saveExportFrameCoverForCurrentUser(data.projectId, data.timeSeconds)
  })

const generateExportCoverFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      prompt: z.string().min(1).max(5000),
      referenceTimeSeconds: z.number().finite().min(0).max(900).optional(),
      titleText: z.string().max(EXPORT_TITLE_MAX_LENGTH),
    })
  )
  .handler(async ({ data }): Promise<ExportItem> => {
    const { generateExportCoverForCurrentUser } =
      await import("@/server/exports")
    return generateExportCoverForCurrentUser(data.projectId, {
      prompt: data.prompt,
      referenceTimeSeconds: data.referenceTimeSeconds,
      titleText: data.titleText,
    })
  })

const deleteExportFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<{ projectId: string }> => {
    const { deleteExportForCurrentUser } = await import("@/server/exports")
    return deleteExportForCurrentUser(data.projectId)
  })

const bulkDeleteExportsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectIds: z.array(z.string().min(1).max(36)).min(1).max(100),
    })
  )
  .handler(async ({ data }): Promise<{ deletedCount: number }> => {
    const { deleteExportsForCurrentUser } = await import("@/server/exports")
    return deleteExportsForCurrentUser(data.projectIds)
  })

export function listExports() {
  return listExportsFn()
}

export function getExport(projectId: string) {
  return getExportFn({ data: { projectId } })
}

export function generateExportDescription(projectId: string) {
  return generateExportDescriptionFn({ data: { projectId } })
}

export function updateExport(projectId: string, input: ExportUpdateInput) {
  return updateExportFn({ data: { projectId, ...input } })
}

export function getExportCoverFrames(projectId: string) {
  return getExportCoverFramesFn({ data: { projectId } })
}

export function getExportCoverFrame(projectId: string, timeSeconds: number) {
  return getExportCoverFrameFn({ data: { projectId, timeSeconds } })
}

export function saveExportFrameCover(projectId: string, timeSeconds: number) {
  return saveExportFrameCoverFn({ data: { projectId, timeSeconds } })
}

export function generateExportCover(
  projectId: string,
  input: GenerateExportCoverInput
) {
  return generateExportCoverFn({
    data: {
      projectId,
      prompt: input.prompt,
      referenceTimeSeconds: input.referenceTimeSeconds,
      titleText: input.titleText,
    },
  })
}

export function deleteExport(projectId: string) {
  return deleteExportFn({ data: { projectId } })
}

export function bulkDeleteExports(projectIds: string[]) {
  return bulkDeleteExportsFn({ data: { projectIds } })
}
