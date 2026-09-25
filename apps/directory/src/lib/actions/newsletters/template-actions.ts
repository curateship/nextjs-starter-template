import { createServerFn } from "@tanstack/react-start"
import { getTemplatesBySiteImpl, getTemplateByIdImpl, createTemplateImpl, updateTemplateImpl, setDefaultTemplateImpl, deleteTemplatesImpl } from "./template-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./template-actions.server"

export const getTemplatesBySite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getTemplatesBySiteImpl(data.siteId, data.options))

export const getTemplateById = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => getTemplateByIdImpl(data.templateId))

export const createTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof createTemplateImpl>[0] }) => data)
  .handler(async ({ data }) => createTemplateImpl(data.input))

export const updateTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string; updates: { name?: string; content_blocks?: Record<string, any> } }) => data)
  .handler(async ({ data }) => updateTemplateImpl(data.templateId, data.updates))

export const setDefaultTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => setDefaultTemplateImpl(data.templateId))

export const deleteTemplates = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => deleteTemplatesImpl(data.ids))
