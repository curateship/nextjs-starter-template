import { createServerFn } from "@tanstack/react-start"
import { getSiteProductsActionImpl, getSiteProductsWithCategoriesActionImpl, updateProductActionImpl, deleteProductActionImpl, deleteProductsActionImpl, duplicateProductActionImpl, updateProductBlocksActionImpl } from "./product-actions.server"
import type { UpdateProductData } from "./product-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./product-actions.server"

export const getSiteProductsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number; selectedSlug?: string } }) => data)
  .handler(async ({ data }) => getSiteProductsActionImpl(data.siteId, data.options))

export const getSiteProductsWithCategoriesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getSiteProductsWithCategoriesActionImpl(data.siteId, data.options))

export const updateProductAction = createServerFn({ method: "POST" })
  .inputValidator((data: { productId: string; updates: UpdateProductData }) => data)
  .handler(async ({ data }) => updateProductActionImpl(data.productId, data.updates))

export const deleteProductAction = createServerFn({ method: "POST" })
  .inputValidator((data: { productId: string }) => data)
  .handler(async ({ data }) => deleteProductActionImpl(data.productId))

export const deleteProductsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { productIds: string[] }) => data)
  .handler(async ({ data }) => deleteProductsActionImpl(data.productIds))

export const duplicateProductAction = createServerFn({ method: "POST" })
  .inputValidator((data: { productId: string; newTitle: string }) => data)
  .handler(async ({ data }) => duplicateProductActionImpl(data.productId, data.newTitle))

export const updateProductBlocksAction = createServerFn({ method: "POST" })
  .inputValidator((data: { productId: string; contentBlocks: Record<string, any> }) => data)
  .handler(async ({ data }) => updateProductBlocksActionImpl(data.productId, data.contentBlocks))
