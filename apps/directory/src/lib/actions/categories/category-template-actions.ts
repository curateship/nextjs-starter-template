import { createServerFn } from "@tanstack/react-start"
import { getCategoryTemplatesBySiteImpl, getCategoryTemplateIdsActionImpl, getCategoryTemplateByIdImpl, createCategoryTemplateImpl, updateCategoryTemplateImpl, setDefaultCategoryTemplateImpl, deleteCategoryTemplatesImpl } from "./category-template-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./category-template-actions.server"

export const getCategoryTemplatesBySite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getCategoryTemplatesBySiteImpl(data.siteId, data.options))

export const getCategoryTemplateIdsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getCategoryTemplateIdsActionImpl(data.siteId))

export const getCategoryTemplateById = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => getCategoryTemplateByIdImpl(data.templateId))

export const createCategoryTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  name: string
  contentBlocks?: Record<string, any>
} }) => data)
  .handler(async ({ data }) => createCategoryTemplateImpl(data.input))

export const updateCategoryTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string; updates: { name?: string; content_blocks?: Record<string, any> } }) => data)
  .handler(async ({ data }) => updateCategoryTemplateImpl(data.templateId, data.updates))

export const setDefaultCategoryTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => setDefaultCategoryTemplateImpl(data.templateId))

export const deleteCategoryTemplates = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => deleteCategoryTemplatesImpl(data.ids))
