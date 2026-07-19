import { createServerFn } from "@tanstack/react-start"
import { getProductTemplatesBySiteImpl, getProductTemplateIdsActionImpl, getProductTemplateByIdImpl, createProductTemplateImpl, updateProductTemplateImpl, setDefaultProductTemplateImpl, deleteProductTemplatesImpl } from "./product-template-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./product-template-actions.server"

export const getProductTemplatesBySite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getProductTemplatesBySiteImpl(data.siteId, data.options))

export const getProductTemplateIdsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getProductTemplateIdsActionImpl(data.siteId))

export const getProductTemplateById = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => getProductTemplateByIdImpl(data.templateId))

export const createProductTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
} }) => data)
  .handler(async ({ data }) => createProductTemplateImpl(data.input))

export const updateProductTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string; updates: { name?: string; content_blocks?: Record<string, any> } }) => data)
  .handler(async ({ data }) => updateProductTemplateImpl(data.templateId, data.updates))

export const setDefaultProductTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => setDefaultProductTemplateImpl(data.templateId))

export const deleteProductTemplates = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => deleteProductTemplatesImpl(data.ids))
