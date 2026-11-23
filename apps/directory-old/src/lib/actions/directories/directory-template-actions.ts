import { createServerFn } from "@tanstack/react-start"
import { getDirectoryTemplatesBySiteImpl, getDirectoryTemplateIdsActionImpl, getDirectoryTemplateByIdImpl, createDirectoryTemplateImpl, updateDirectoryTemplateImpl, setDefaultDirectoryTemplateImpl, deleteDirectoryTemplatesImpl } from "./directory-template-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./directory-template-actions.server"

export const getDirectoryTemplatesBySite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getDirectoryTemplatesBySiteImpl(data.siteId, data.options))

export const getDirectoryTemplateIdsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getDirectoryTemplateIdsActionImpl(data.siteId))

export const getDirectoryTemplateById = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => getDirectoryTemplateByIdImpl(data.templateId))

export const createDirectoryTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof createDirectoryTemplateImpl>[0] }) => data)
  .handler(async ({ data }) => createDirectoryTemplateImpl(data.input))

export const updateDirectoryTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string; updates: { name?: string; content_blocks?: Record<string, any> } }) => data)
  .handler(async ({ data }) => updateDirectoryTemplateImpl(data.templateId, data.updates))

export const setDefaultDirectoryTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => setDefaultDirectoryTemplateImpl(data.templateId))

export const deleteDirectoryTemplates = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => deleteDirectoryTemplatesImpl(data.ids))
