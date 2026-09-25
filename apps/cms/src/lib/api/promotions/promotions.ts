import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ListingHours } from "@/lib/directory/listing-details"
import { LISTING_STATUS_FILTERS } from "@/lib/directory/listing-sort"
import {
  MAX_PROMOTION_CODE,
  MAX_PROMOTION_DESCRIPTION,
  MAX_PROMOTION_SMALL_PRINT,
  MAX_PROMOTION_TITLE,
} from "@/lib/promotions/deal-limits"
import {
  PROMOTION_SORT_COLUMNS,
  type PromotionSortColumn,
} from "@/lib/promotions/promotion-sort"
import { adminGet, adminPost } from "@/server/guards"
import {
  createPromotion,
  deletePromotions,
  findPromotion,
  listingHoursForDeal,
  listPromotions,
  reopenPromotion,
  updatePromotion,
  type PromotionForEdit,
  type PromotionInput,
  type PromotionStatus,
  type PromotionSummary,
  type SitePromotion,
} from "@/server/promotions/promotions"
import { pendingPromotionRequestCount } from "@/server/promotions/owner-requests"
import { listClaims, type DealClaim } from "@/server/promotions/claims"
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
  /** The site's wall clock, "2026-09-24T16:30", so a row can say it has ended. */
  now: string
  /** Deals and changes from owners waiting in the queue. */
  waiting: number
}

const idInput = z.string().min(1).max(36)

/** A blank title, the listing, the type and headline and the days are checked by the server, which says what is wrong in words. */
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
  // Longer than the columns on purpose: the server refuses in words.
  dealType: z.string().max(20),
  amount: z.string().max(20),
  headline: z.string().max(100),
  // A listing's hours shape, which `cleanDealTimes` checks and names in words.
  times: z.unknown().optional(),
  takesClaims: z.boolean().optional(),
  // Read by the server in words, so a little longer than any real number.
  claimLimit: z.string().max(20).optional(),
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
    const [{ promotions, total, now }, waiting] = await Promise.all([
      listPromotions(site, {
        search: data.search,
        status: data.status,
        sort: data.sort,
        direction: data.direction,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      pendingPromotionRequestCount(site),
    ])
    return { promotions, total, page, pageSize, now, waiting }
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

/** The deal window's whole load: the deal, its listing, its writer, who claimed it. */
export type PromotionWindowData = PromotionForEdit & { claims: DealClaim[] }

const loadPromotionForEditFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: idInput }))
  .handler(
    async ({
      data,
      context,
    }): Promise<PromotionWindowData | null> => {
      const site = await workspaceIdForRequest(context.user.id)
      const [found, claims] = await Promise.all([
        findPromotion(site, data.id),
        listClaims(site, data.id),
      ])
      return found ? { ...found, claims } : null
    }
  )

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

const loadListingHoursFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ listingId: idInput }))
  .handler(async ({ data, context }): Promise<ListingHours | null> => {
    return listingHoursForDeal(
      await workspaceIdForRequest(context.user.id),
      data.listingId
    )
  })

/** A listing's opening hours, for "Same as the listing's hours". */
export function loadListingHoursForDeal(listingId: string) {
  return loadListingHoursFn({ data: { listingId } })
}

const reopenFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: idInput }))
  .handler(async ({ data, context }): Promise<void> => {
    await reopenPromotion(await workspaceIdForRequest(context.user.id), data.id)
  })

/** Undoes "End now", at once. */
export function reopenEndedPromotion(id: string) {
  return reopenFn({ data: { id } })
}
