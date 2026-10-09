import { createServerFn } from "@tanstack/react-start"
import { getRequestHeader } from "@tanstack/react-start/server"
import { z } from "zod"

import type { DirectoryFilterGroup } from "@/lib/directory/filter-groups"
import { groupCategorySlugs } from "@/lib/directory/filter-groups"
import {
  parseDirectoryNearPoint,
  readDirectoryCategories,
} from "@/lib/directory/public-search"
import type { EventNearSearch } from "@/lib/events/events-page"
import { wallClockAt } from "@/lib/events/event-time"
import {
  DEAL_ON_FILTERS,
  readDealsSearch,
  type DealOnFilter,
  type DealsPageSearch,
} from "@/lib/promotions/deals-page"
import { requireAppOrigin } from "@/server/auth/origin"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import {
  describeRequestOrigin,
  findCurrentUser,
  findSessionContext,
  isAdmin,
  now as currentTime,
} from "@/server/auth/security"
import { visitorSite, type PublicSite, type VisitorSite } from "@/server/directory/public"
import { siteTimeZone } from "@/server/directory/settings"
import { claimBoxFor, type ClaimBox } from "@/server/promotions/claims"
import { countDealVisit, type DealCountKind } from "@/server/promotions/counts"
import {
  dealViewAt,
  shownCodeAt,
  listedDealsAt,
  type DealView,
  type ListedDeal,
} from "@/server/promotions/deal-view"
import {
  dealsAccessFor,
  readDealFilters,
  readDealWhenCounts,
  readDeals,
  readPublicDeal,
  type DealWhenCounts,
} from "@/server/promotions/public"
import {
  getDaySalt,
  hashVisitor,
  isBotUserAgent,
  isPrefetchPurpose,
  trafficDay,
} from "@/server/traffic"

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
  /** The Cuisine and Neighbourhood buttons above the deals. */
  filterGroups: DirectoryFilterGroup[]
  /** The ticked boxes in the visitor's own words, for the line above the cards. */
  tickedNames: string[]
  /** How many deals sit behind each "when" chip. */
  whenCounts: DealWhenCounts
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
      q: z.string().max(120).optional(),
      // Long enough for the twelve slugs the address reader keeps, and no
      // longer — a validator is the cheapest place to stop somebody pasting a
      // megabyte. The same two numbers the directory's own door uses.
      category: z.string().max(2_000).optional(),
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
    const filters = await readDealFilters(site.id, now)
    // A ticked slug nobody has is no filter at all rather than an error: a
    // stale link should still show the deals.
    const ticked = readDirectoryCategories(search.category)
    const point = parseDirectoryNearPoint(search.near)
    const narrowing = {
      q: search.q,
      categoryGroups: groupCategorySlugs(filters.categories, ticked),
      ...(point ? { near: point, radius: search.radius } : {}),
    }
    const [list, whenCounts] = await Promise.all([
      readDeals(site, search.page ?? 1, now, undefined, {
        ...narrowing,
        on: search.on,
      }),
      readDealWhenCounts(site, now, undefined, narrowing),
    ])
    return {
      ...list,
      deals: listedDealsAt(list.deals, now),
      filterGroups: filters.groups,
      // The address carries slugs, so they are turned back into the names that
      // were clicked.
      tickedNames: ticked.map(
        (slug) =>
          filters.categories.find((row) => row.slug === slug)?.name ?? slug
      ),
      whenCounts,
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

// Roughly a count every 2.5 seconds all window long, the traffic counter's
// own limit: more than any person taps, less than a hammering script.
const COUNT_RATE_LIMIT = { maxAttempts: 240, windowSeconds: 600 }

/**
 * Counts this view or this Show code tap the way the site's traffic counter
 * counts a page view: never a bot, a prefetch or an admin, and the person is
 * the counter's own daily hash. `countDealVisit` keeps it to once per person
 * per deal per day. Never throws: a count that could not be written must not
 * stop the page or the code.
 */
async function countVisit(promotionId: string, kind: DealCountKind) {
  try {
    const origin = describeRequestOrigin()
    if (isBotUserAgent(origin.userAgent)) return
    if (
      isPrefetchPurpose(getRequestHeader("sec-purpose")) ||
      isPrefetchPurpose(getRequestHeader("purpose"))
    ) {
      return
    }
    const at = currentTime()
    const salt = await getDaySalt(trafficDay(at))
    const visitorHash = hashVisitor(
      salt,
      origin.ipAddress ?? "",
      origin.userAgent ?? ""
    )
    await enforceRateLimit(`deal-count:${visitorHash}`, COUNT_RATE_LIMIT)
    // Admins never count, neither as themselves nor while viewing as a member.
    const session = await findSessionContext()
    if (session && (session.viewedBy || isAdmin(session.user))) return
    await countDealVisit({ promotionId, kind, visitorHash }, undefined, at)
  } catch {
    // A count never surfaces errors, the same as the traffic beacon.
  }
}

const countDealViewFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slug: z.string().min(1).max(160) }))
  .handler(async ({ data }): Promise<void> => {
    requireAppOrigin()
    const site = await siteWithOpenDeals()
    if (!site) return
    const page = await readPublicDeal(site, data.slug)
    if (!page) return
    await countVisit(page.deal.id, "view")
  })

/** Counts one view of a deal's page. Sent once by the page after it opens. */
export function countDealView(slug: string) {
  return countDealViewFn({ data: { slug } })
}

export type ShownCode =
  | { code: string }
  | { code: null; problem: string }

const showDealCodeFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slug: z.string().min(1).max(160) }))
  .handler(async ({ data }): Promise<ShownCode> => {
    requireAppOrigin()
    const site = await siteWithOpenDeals()
    const page = site ? await readPublicDeal(site, data.slug) : null
    if (!page) {
      return { code: null, problem: "This deal is no longer on this site." }
    }
    // Asked again here, after the cache, rather than trusting the button: the
    // deal may have ended, or switched to claims, since the page opened.
    const code = shownCodeAt(page, new Date())
    if (!code) {
      return {
        code: null,
        problem: page.deal.takesClaims
          ? "This deal gives everyone their own code. Claim it below."
          : "This deal has ended, so its code is gone.",
      }
    }
    await countVisit(page.deal.id, "code")
    return { code }
  })

/** The deal's code, for the Show code button, and one tap counted. */
export function showDealCode(slug: string) {
  return showDealCodeFn({ data: { slug } })
}

export type { ListedDeal } from "@/server/promotions/deal-view"
export type { DealWhenCounts } from "@/server/promotions/public"
export type { ClaimBox } from "@/server/promotions/claims"
