import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { parseDirectoryNearPoint } from "@/lib/directory/public-search"
import type { EventNearSearch } from "@/lib/events/events-page"
import { wallClockAt } from "@/lib/events/event-time"
import {
  DEAL_ON_FILTERS,
  readDealsSearch,
  type DealOnFilter,
  type DealsPageSearch,
} from "@/lib/promotions/deals-page"
import { findCurrentUser } from "@/server/auth/security"
import { visitorSite, type PublicSite, type VisitorSite } from "@/server/directory/public"
import { siteTimeZone } from "@/server/directory/settings"
import { claimBoxFor, type ClaimBox } from "@/server/promotions/claims"
import {
  dealViewAt,
  listedDealsAt,
  type DealView,
  type ListedDeal,
} from "@/server/promotions/deal-view"
import {
  dealsAccessFor,
  readDealCategories,
  readDeals,
  readPublicDeal,
  type DealCategory,
} from "@/server/promotions/public"

/**
 * The Deals page's two doors. Neither carries a guard, because a public page
 * that needs a session is not a public page; both are written down in
 * `src/app/open-endpoints.ts` with the reason.
 *
 * Each checks the Deals page's own switch before reading anything. The route
 * checks it too, but the route only decides what a browser draws, and anyone
 * can call these directly. A switched-off Deals page, or a members-only one
 * asked for by somebody signed out, answers null, the same as a page that
 * does not exist.
 *
 * "Today" is the site's own calendar, worked out here on every request, after
 * the cache. The browser's clock is never asked.
 */

async function siteWithOpenDeals(): Promise<VisitorSite | null> {
  const site = await visitorSite()
  if (!site) return null
  const access = await dealsAccessFor(site.id, async () =>
    Boolean(await findCurrentUser().catch(() => null))
  )
  return access ? site : null
}

export type DealsPageData = {
  site: PublicSite
  /** Each card with its words for this moment, by the site's clock. */
  deals: ListedDeal[]
  /** Every category with a live deal, for the chips. */
  categories: DealCategory[]
  /** The category the page is narrowed to, or null for every deal. */
  category: DealCategory | null
  /** The "when" chip that is on, or null for any time. */
  on: DealOnFilter | null
  /** The distance filter as read, empty when there is none. */
  nearby: EventNearSearch
  total: number
  page: number
  pageSize: number
}

const readDealsPageFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      page: z.number().int().min(1).max(10_000).optional(),
      category: z.string().max(160).optional(),
      on: z.enum(DEAL_ON_FILTERS).optional(),
      near: z.string().max(40).optional(),
      radius: z.number().int().optional(),
      area: z.string().max(120).optional(),
    })
  )
  .handler(async ({ data }): Promise<DealsPageData | null> => {
    const site = await siteWithOpenDeals()
    if (!site) return null
    const now = wallClockAt(await siteTimeZone(site.id), new Date())
    // Read again with the route's rule, because anyone can call this with any
    // text.
    const search = readDealsSearch(data)
    const categories = await readDealCategories(site.id, now)
    // A category with no live deal here shows every deal.
    const category =
      categories.find((row) => row.slug === search.category) ?? null
    const point = parseDirectoryNearPoint(search.near)
    const list = await readDeals(site, search.page ?? 1, now, undefined, {
      categoryId: category?.id,
      on: search.on,
      ...(point ? { near: point, radius: search.radius } : {}),
    })
    return {
      ...list,
      deals: listedDealsAt(list.deals, now),
      categories,
      category,
      on: search.on ?? null,
      nearby: point
        ? { near: search.near, radius: search.radius, area: search.area }
        : {},
    }
  })

/** One page of the visited site's Deals page, or null if it is closed. */
export function loadDealsPage(input: DealsPageSearch) {
  return readDealsPageFn({ data: input })
}

const readDealFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().min(1).max(160) }))
  .handler(
    async ({
      data,
    }): Promise<(DealView & { claimBox: ClaimBox | null }) | null> => {
      const site = await siteWithOpenDeals()
      if (!site) return null
      const page = await readPublicDeal(site, data.slug)
      if (!page) return null
      // Read on every visit, after the cache, so the places left are fresh.
      const at = new Date()
      const view = dealViewAt(page, at)
      const claimBox = await claimBoxFor(
        site.id,
        page.deal.id,
        wallClockAt(page.timeZone, at)
      )
      return { ...view, claimBox }
    }
  )

/** One published deal by its address, or null if there is not one. */
export function loadDeal(slug: string) {
  return readDealFn({ data: { slug } })
}

export type { ListedDeal } from "@/server/promotions/deal-view"
export type { DealCategory } from "@/server/promotions/public"
export type { ClaimBox } from "@/server/promotions/claims"
