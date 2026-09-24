import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { LISTING_STATUS_FILTERS } from "@/lib/directory/listing-sort"
import {
  PROMOTION_SORT_COLUMNS,
  type PromotionSortColumn,
} from "@/lib/promotions/promotion-sort"
import { adminGet, adminPost } from "@/server/guards"
import {
  createPromotion,
  deletePromotions,
  findPromotion,
  listPromotions,
  MAX_PROMOTION_CODE,
  MAX_PROMOTION_DESCRIPTION,
  MAX_PROMOTION_SMALL_PRINT,
  MAX_PROMOTION_TITLE,
  updatePromotion,
  type PromotionForEdit,
  type PromotionInput,
  type PromotionStatus,
  type PromotionSummary,
  type SitePromotion,
} from "@/server/promotions/promotions"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { getListingErrorMessage } from "../directory/listings"

export type { PromotionForEdit, PromotionInput, PromotionSummary }

/**
 * Admin → Promotions' doors. All admin-only, and all work on the site the
 * admin has open, read on the server rather than sent by the page. The
 * server's refusals are sentences about what the admin typed, so they pass
 * through.
 */
export const getPromotionErrorMessage = getListingErrorMessage

export type PromotionsPage = {
  promotions: PromotionSummary[]
  total: number
  page: number
  pageSize: number
  /** The site's today, "2026-09-24", so a row can say it has ended. */
  today: string
}

const idInput = z.string().min(1).max(36)

/** A blank title, the listing and the days are checked by the server, which says what is wrong in words. */
const promotionInput = z.object({
  title: z.string().max(MAX_PROMOTION_TITLE),
  slug: z.string().max(160).optional(),
  listingId: z.string().max(36),
  description: z.string().max(MAX_PROMOTION_DESCRIPTION),
  coverImage: z.string().max(600),
  startDate: z.string().max(10),
  endDate: z.string().max(10).nullable(),
  code: z.string().max(MAX_PROMOTION_CODE),
  smallPrint: z.string().max(MAX_PROMOTION_SMALL_PRINT),
  status: z.enum(["draft", "published"]),
})

const loadPromotionsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      search: z.string().max(120).optional(),
      status: z.enum(LISTING_STATUS_FILTERS).optional(),
      sort: z.enum(PROMOTION_SORT_COLUMNS).optional(),
      direction: z.enum(["asc", "desc"]).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<PromotionsPage> => {
    const pageSize = data.limit ?? 50
    const page = data.page ?? 1
    const site = await workspaceIdForRequest(context.user.id)
    const { promotions, total, today } = await listPromotions(site, {
      search: data.search,
      status: data.status,
      sort: data.sort,
      direction: data.direction,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
    return { promotions, total, page, pageSize, today }
  })

export function loadPromotionsPage(input: {
  search?: string
  status?: PromotionStatus
  sort?: PromotionSortColumn
  direction?: "asc" | "desc"
  page?: number
  limit?: number
}) {
  return loadPromotionsPageFn({ data: input })
}

const loadPromotionForEditFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: idInput }))
  .handler(async ({ data, context }): Promise<PromotionForEdit | null> => {
    return findPromotion(await workspaceIdForRequest(context.user.id), data.id)
  })

export function loadPromotionForEdit(id: string) {
  return loadPromotionForEditFn({ data: { id } })
}

const createPromotionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(promotionInput)
  .handler(async ({ data, context }): Promise<SitePromotion> => {
    const site = await workspaceIdForRequest(context.user.id)
    return createPromotion(site, context.user.id, data)
  })

export function saveNewPromotion(input: PromotionInput) {
  return createPromotionFn({ data: input })
}

const updatePromotionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(promotionInput.extend({ id: idInput, slug: z.string().max(160) }))
  .handler(async ({ data, context }): Promise<SitePromotion> => {
    const { id, ...rest } = data
    return updatePromotion(
      await workspaceIdForRequest(context.user.id),
      id,
      rest
    )
  })

export function savePromotion(input: PromotionInput & { id: string; slug: string }) {
  return updatePromotionFn({ data: input })
}

const deletePromotionsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(idInput).min(1).max(500) }))
  .handler(
    async ({ data, context }): Promise<{ done: string[]; kept: string[] }> => {
      return deletePromotions(
        await workspaceIdForRequest(context.user.id),
        data.ids
      )
    }
  )

/** One request for the whole selection; the result counts honestly. */
export function removePromotions(ids: string[]) {
  return deletePromotionsFn({ data: { ids } })
}
