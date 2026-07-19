import { createServerFn } from "@tanstack/react-start"
import { getCategoriesForSiteActionImpl, getCategoriesWithCountsActionImpl, createCategoryActionImpl, updateCategoryActionImpl, deleteCategoryActionImpl, deleteCategoriesActionImpl, updateCategoryBlockValuesActionImpl, getCategoriesWithMergedBlocksActionImpl } from "./category-actions.server"
import type { CreateCategoryData, UpdateCategoryData } from "./category-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./category-actions.server"

export const getCategoriesForSiteAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number; selectedSlug?: string } }) => data)
  .handler(async ({ data }) => getCategoriesForSiteActionImpl(data.siteId, data.options))

export const getCategoriesWithCountsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number; parentSlug?: string | null } }) => data)
  .handler(async ({ data }) => getCategoriesWithCountsActionImpl(data.siteId, data.options))

export const createCategoryAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; data: CreateCategoryData }) => data)
  .handler(async ({ data }) => createCategoryActionImpl(data.siteId, data.data))

export const updateCategoryAction = createServerFn({ method: "POST" })
  .inputValidator((data: { categoryId: string; data: UpdateCategoryData }) => data)
  .handler(async ({ data }) => updateCategoryActionImpl(data.categoryId, data.data))

export const deleteCategoryAction = createServerFn({ method: "POST" })
  .inputValidator((data: { categoryId: string }) => data)
  .handler(async ({ data }) => deleteCategoryActionImpl(data.categoryId))

export const deleteCategoriesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { categoryIds: string[] }) => data)
  .handler(async ({ data }) => deleteCategoriesActionImpl(data.categoryIds))

export const updateCategoryBlockValuesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { categoryId: string; contentBlocks: Record<string, any> }) => data)
  .handler(async ({ data }) => updateCategoryBlockValuesActionImpl(data.categoryId, data.contentBlocks))

export const getCategoriesWithMergedBlocksAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number; selectedSlug?: string } }) => data)
  .handler(async ({ data }) => getCategoriesWithMergedBlocksActionImpl(data.siteId, data.options))
