import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { timelineSchema, type ProjectTimeline } from "@/lib/api/video-projects"
import type {
  TemplateDetail,
  TemplateItem,
  TemplateListResponse,
  TemplateStructureTag,
} from "@/server/video-templates"

export type {
  TemplateDetail,
  TemplateItem,
  TemplateListResponse,
  TemplateStructureTag,
}

const templateIdSchema = z.object({
  templateId: z.string().min(1).max(36),
})

const templateNameSchema = z.string().min(1).max(255)

const templateSafeErrorMessages = new Set([
  "Template name is required",
  "Project name is required",
  "Template not found",
  "Video not found",
  "Video analysis is not ready",
  "Template was not created",
  "Project was not created",
])

export function getTemplateErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Template request failed."
  if (templateSafeErrorMessages.has(error.message)) return error.message
  return "Template request failed."
}

const listTemplatesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<TemplateListResponse> => {
    const { listTemplatesForCurrentUser } = await import(
      "@/server/video-templates"
    )
    return listTemplatesForCurrentUser()
  }
)

const createTemplateFromViralVideoFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ videoId: z.string().min(1).max(36), name: templateNameSchema })
  )
  .handler(async ({ data }): Promise<TemplateItem> => {
    const { createTemplateFromViralVideoForCurrentUser } = await import(
      "@/server/video-templates"
    )
    return createTemplateFromViralVideoForCurrentUser(data.videoId, data.name)
  })

const createBlankTemplateFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: templateNameSchema }))
  .handler(async ({ data }): Promise<TemplateItem> => {
    const { createBlankTemplateForCurrentUser } = await import(
      "@/server/video-templates"
    )
    return createBlankTemplateForCurrentUser(data.name)
  })

const renameTemplateFn = createServerFn({ method: "POST" })
  .inputValidator(templateIdSchema.extend({ name: templateNameSchema }))
  .handler(async ({ data }): Promise<TemplateItem> => {
    const { renameTemplateForCurrentUser } = await import(
      "@/server/video-templates"
    )
    return renameTemplateForCurrentUser(data.templateId, data.name)
  })

const deleteTemplateFn = createServerFn({ method: "POST" })
  .inputValidator(templateIdSchema)
  .handler(async ({ data }): Promise<{ templateId: string }> => {
    const { deleteTemplateForCurrentUser } = await import(
      "@/server/video-templates"
    )
    return deleteTemplateForCurrentUser(data.templateId)
  })

const createProjectFromTemplateFn = createServerFn({ method: "POST" })
  .inputValidator(templateIdSchema.extend({ name: templateNameSchema }))
  .handler(async ({ data }): Promise<{ projectId: string }> => {
    const { createProjectFromTemplateForCurrentUser } = await import(
      "@/server/video-templates"
    )
    return createProjectFromTemplateForCurrentUser(data.templateId, data.name)
  })

const getTemplateForEditingFn = createServerFn({ method: "GET" })
  .inputValidator(templateIdSchema)
  .handler(async ({ data }): Promise<TemplateDetail> => {
    const { getTemplateForEditingForCurrentUser } = await import(
      "@/server/video-templates"
    )
    return getTemplateForEditingForCurrentUser(data.templateId)
  })

const saveTemplateTimelineFn = createServerFn({ method: "POST" })
  .inputValidator(templateIdSchema.extend({ timeline: timelineSchema }))
  .handler(async ({ data }): Promise<{ templateId: string }> => {
    const { saveTemplateTimelineForCurrentUser } = await import(
      "@/server/video-templates"
    )
    return saveTemplateTimelineForCurrentUser(data.templateId, data.timeline)
  })

export function getTemplateForEditing(templateId: string) {
  return getTemplateForEditingFn({ data: { templateId } })
}

export function saveTemplateTimeline(
  templateId: string,
  timeline: ProjectTimeline
) {
  return saveTemplateTimelineFn({ data: { templateId, timeline } })
}

export function listTemplates() {
  return listTemplatesFn()
}

export function createTemplateFromViralVideo(videoId: string, name: string) {
  return createTemplateFromViralVideoFn({ data: { videoId, name } })
}

export function createBlankTemplate(name: string) {
  return createBlankTemplateFn({ data: { name } })
}

export function renameTemplate(templateId: string, name: string) {
  return renameTemplateFn({ data: { templateId, name } })
}

export function deleteTemplate(templateId: string) {
  return deleteTemplateFn({ data: { templateId } })
}

const bulkDeleteTemplatesFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      templateIds: z.array(z.string().min(1).max(36)).min(1).max(100),
    })
  )
  .handler(async ({ data }): Promise<{ deletedCount: number }> => {
    const { deleteTemplatesForCurrentUser } = await import(
      "@/server/video-templates"
    )
    return deleteTemplatesForCurrentUser(data.templateIds)
  })

export function bulkDeleteTemplates(templateIds: string[]) {
  return bulkDeleteTemplatesFn({ data: { templateIds } })
}

export function createProjectFromTemplate(templateId: string, name: string) {
  return createProjectFromTemplateFn({ data: { templateId, name } })
}
