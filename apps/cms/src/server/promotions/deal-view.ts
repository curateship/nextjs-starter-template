import { wallClockAt } from "@/lib/events/event-time"
import { dealCardDaysText, dealDaysText } from "@/lib/promotions/deal-days"
import {
  dealNowText,
  dealStage,
  dealTimesLines,
} from "@/lib/promotions/deal-times"
import type { PublicSite } from "@/server/directory/public"
import type {
  PublicDeal,
  PublicDealCard,
  PublicDealPage,
} from "@/server/promotions/public"

/**
 * How cached deals read at one moment, by the site's clock. Worked out after
 * the cache on every request, so a cached answer never says a deal is on
 * when it is not, and never shows an ended deal's code.
 */

/** A card on the Deals page, with its words for this moment. */
export type ListedDeal = PublicDealCard & {
  /** Inside its days, or not started. The list never holds an ended one. */
  stage: "on" | "soon"
  /** "Until Sun, Oct 12", "Starts Thu, Oct 1". */
  daysText: string
  /** "On now · until 6 PM", "Next: today at 4 PM", or null. */
  nowText: string | null
}

export type DealView = {
  site: PublicSite
  /** The code is empty once the deal has ended, so it never reaches the page. */
  deal: PublicDeal
  ended: boolean
  /** Not started yet by the site's calendar. */
  upcoming: boolean
  /** "Oct 3, 2026 to Oct 12, 2026", written once here for the page. */
  days: string
  /** "Mon to Fri, 4 to 6 PM", one line per set of days. Empty for all day. */
  times: string[]
  /** "On now · until 6 PM", "Next: tomorrow at 4 PM", or null. */
  nowText: string | null
}

/** The Deals page's cards at `now`, the site's "2026-09-24T16:30". */
export function listedDealsAt(
  deals: PublicDealCard[],
  now: string
): ListedDeal[] {
  const today = now.slice(0, 10)
  return deals.map((deal) => {
    // The read left out every ended deal at this same moment.
    const stage = dealStage(deal, now) === "soon" ? "soon" : "on"
    return {
      ...deal,
      stage,
      daysText: dealCardDaysText(deal, stage, today),
      nowText: dealNowText(deal, now),
    }
  })
}

/** A cached deal page as a visitor sees it at `at`. */
export function dealViewAt(page: PublicDealPage, at: Date): DealView {
  const now = wallClockAt(page.timeZone, at)
  const stage = dealStage(page.deal, now)
  const ended = stage === "ended"
  return {
    site: page.site,
    deal: ended ? { ...page.deal, code: "" } : page.deal,
    ended,
    upcoming: stage === "soon",
    days: dealDaysText(page.deal),
    times: dealTimesLines(page.deal.times),
    nowText: dealNowText(page.deal, now),
  }
}
