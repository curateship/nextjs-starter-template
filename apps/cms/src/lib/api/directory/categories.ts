import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"
import {
  categoryDeleteImpact,
  createCategory,
  deleteCategory,
  listCategories,
  MAX_CATEGORY_NAME,
  updateCategory,
  type Category,
} from "@/server/directory/categories"

import { describeAuthError } from "../error-message"

export type { Category }

/**
 * The categories screen's doors, all admin-only. The server's refusals are
 * already sentences an admin can act on — "A category cannot sit under one of
 * its own subcategories" — so they pass through as they are.
 */
export function getCategoryErrorMessage(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ""
  return (
    describeAuthError(message) ??
    (message || "That could not be done. Please try again.")
  )
}

const loadCategoriesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<Category[]> => {
    return listCategories(await workspaceIdForRequest(context.user.id))
  })

export function loadCategories() {
  return loadCategoriesFn()
}

const categoryInput = z.object({
  name: z.string().min(1).max(MAX_CATEGORY_NAME),
  slug: z.string().max(160).optional(),
  description: z.string().max(500).optional(),
  parentId: z.string().min(1).max(36).nullable().optional(),
})

const createCategoryFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(categoryInput)
  .handler(async ({ data, context }): Promise<Category> => {
    return createCategory(await workspaceIdForRequest(context.user.id), data)
  })

export function saveNewCategory(input: {
  name: string
  slug?: string
  description?: string
  parentId?: string | null
}) {
  return createCategoryFn({ data: input })
}

const updateCategoryFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    categoryInput.partial().extend({ id: z.string().min(1).max(36) })
  )
  .handler(async ({ data, context }): Promise<Category> => {
    const { id, ...rest } = data
    return updateCategory(
      await workspaceIdForRequest(context.user.id),
      id, rest)
  })

export function saveCategory(input: {
  id: string
  name?: string
  slug?: string
  description?: string
  parentId?: string | null
}) {
  return updateCategoryFn({ data: input })
}

const categoryDeleteImpactFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => {
    return categoryDeleteImpact(
      await workspaceIdForRequest(context.user.id),
      data.id
    )
  })

/** What deleting this category takes with it, for the confirmation to say. */
export function loadCategoryDeleteImpact(id: string) {
  return categoryDeleteImpactFn({ data: { id } })
}

const deleteCategoryFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<{ name: string }> => {
    return deleteCategory(await workspaceIdForRequest(context.user.id), data.id)
  })

export function removeCategory(id: string) {
  return deleteCategoryFn({ data: { id } })
}
