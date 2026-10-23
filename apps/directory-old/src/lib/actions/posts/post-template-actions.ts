import { createServerFn } from "@tanstack/react-start"
import { getPostTemplatesBySiteImpl, getPostTemplateIdsActionImpl, getPostTemplateByIdImpl, createPostTemplateImpl, updatePostTemplateImpl, setDefaultPostTemplateImpl, deletePostTemplatesImpl } from "./post-template-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./post-template-actions.server"

export const getPostTemplatesBySite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getPostTemplatesBySiteImpl(data.siteId, data.options))

export const getPostTemplateIdsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getPostTemplateIdsActionImpl(data.siteId))

export const getPostTemplateById = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => getPostTemplateByIdImpl(data.templateId))

export const createPostTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof createPostTemplateImpl>[0] }) => data)
  .handler(async ({ data }) => createPostTemplateImpl(data.input))

export const updatePostTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string; updates: { name?: string; content_blocks?: Record<string, any> } }) => data)
  .handler(async ({ data }) => updatePostTemplateImpl(data.templateId, data.updates))

export const setDefaultPostTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => setDefaultPostTemplateImpl(data.templateId))

export const deletePostTemplates = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => deletePostTemplatesImpl(data.ids))
