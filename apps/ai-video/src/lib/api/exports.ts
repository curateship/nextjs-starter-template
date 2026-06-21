import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  EXPORT_CAPTION_MAX_LENGTH,
  EXPORT_TITLE_MAX_LENGTH,
} from "@/lib/export-constraints"
import type {
  ExportDescriptionResult,
  ExportItem,
  ExportListResponse,
  ExportUpdateInput,
} from "@/server/exports"

export type {
  ExportDescriptionResult,
  ExportItem,
  ExportListResponse,
  ExportUpdateInput,
}

const exportSafeErrorMessages = new Set([
  "Export not found",
  "Export title is required",
  "Description generation is not configured",
  "Description generation returned no result",
  "Description generation returned invalid JSON",
  "Description generation returned an unexpected shape",
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

export function deleteExport(projectId: string) {
  return deleteExportFn({ data: { projectId } })
}

export function bulkDeleteExports(projectIds: string[]) {
  return bulkDeleteExportsFn({ data: { projectIds } })
}
