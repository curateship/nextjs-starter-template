import { createServerFn } from "@tanstack/react-start"
import { getEventTemplatesBySiteImpl, getEventTemplateIdsActionImpl, getEventTemplateByIdImpl, createEventTemplateImpl, updateEventTemplateImpl, setDefaultEventTemplateImpl, deleteEventTemplatesImpl } from "./event-template-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./event-template-actions.server"

export const getEventTemplatesBySite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getEventTemplatesBySiteImpl(data.siteId, data.options))

export const getEventTemplateIdsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getEventTemplateIdsActionImpl(data.siteId))

export const getEventTemplateById = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => getEventTemplateByIdImpl(data.templateId))

export const createEventTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
} }) => data)
  .handler(async ({ data }) => createEventTemplateImpl(data.input))

export const updateEventTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string; updates: { name?: string; content_blocks?: Record<string, any> } }) => data)
  .handler(async ({ data }) => updateEventTemplateImpl(data.templateId, data.updates))

export const setDefaultEventTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => setDefaultEventTemplateImpl(data.templateId))

export const deleteEventTemplates = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => deleteEventTemplatesImpl(data.ids))
