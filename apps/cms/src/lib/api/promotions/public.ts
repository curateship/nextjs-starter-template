import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { wallClockAt } from "@/lib/events/event-time"
import { findCurrentUser } from "@/server/auth/security"
import { visitorSite, type PublicSite, type VisitorSite } from "@/server/directory/public"
import { siteTimeZone } from "@/server/directory/settings"
import {
  dealViewAt,
  listedDealsAt,
  type DealView,
  type ListedDeal,
} from "@/server/promotions/deal-view"
import {
  dealsAccessFor,
  readDeals,
  readPublicDeal,
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
  total: number
  page: number
  pageSize: number
}

const readDealsPageFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({ page: z.number().int().min(1).max(10_000).optional() })
  )
  .handler(async ({ data }): Promise<DealsPageData | null> => {
    const site = await siteWithOpenDeals()
    if (!site) return null
    const now = wallClockAt(await siteTimeZone(site.id), new Date())
    const list = await readDeals(site, data.page ?? 1, now)
    return { ...list, deals: listedDealsAt(list.deals, now) }
  })

/** One page of the visited site's Deals page, or null if it is closed. */
export function loadDealsPage(input: { page?: number }) {
  return readDealsPageFn({ data: input })
}

const readDealFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().min(1).max(160) }))
  .handler(async ({ data }): Promise<DealView | null> => {
    const site = await siteWithOpenDeals()
    if (!site) return null
    const page = await readPublicDeal(site, data.slug)
    return page ? dealViewAt(page, new Date()) : null
  })

/** One published deal by its address, or null if there is not one. */
export function loadDeal(slug: string) {
  return readDealFn({ data: { slug } })
}

export type { ListedDeal } from "@/server/promotions/deal-view"
