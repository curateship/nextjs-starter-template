import { createServerFn } from "@tanstack/react-start"
import { getContentBreadcrumbPreviewActionImpl, getCategoryBreadcrumbPreviewActionImpl, getContentCategoriesActionImpl, bulkAssignCategoriesToContentActionImpl } from "./category-relationship-actions.server"
import type { BreadcrumbContentType, ContentType } from "./category-relationship-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./category-relationship-actions.server"

export const getContentBreadcrumbPreviewAction = createServerFn({ method: "POST" })
  .inputValidator((data: { contentId: string; contentType: BreadcrumbContentType }) => data)
  .handler(async ({ data }) => getContentBreadcrumbPreviewActionImpl(data.contentId, data.contentType))

export const getCategoryBreadcrumbPreviewAction = createServerFn({ method: "POST" })
  .inputValidator((data: { categoryId: string }) => data)
  .handler(async ({ data }) => getCategoryBreadcrumbPreviewActionImpl(data.categoryId))

export const getContentCategoriesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { contentId: string; contentType: ContentType }) => data)
  .handler(async ({ data }) => getContentCategoriesActionImpl(data.contentId, data.contentType))

export const bulkAssignCategoriesToContentAction = createServerFn({ method: "POST" })
  .inputValidator((data: { contentId: string; contentType: ContentType; categoryIds: string[]; primaryCategoryId?: string | null }) => data)
  .handler(async ({ data }) => bulkAssignCategoriesToContentActionImpl(data.contentId, data.contentType, data.categoryIds, data.primaryCategoryId))
