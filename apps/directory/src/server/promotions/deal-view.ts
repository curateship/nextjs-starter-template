import { wallClockAt } from "@/lib/events/event-time"
import { ENDING_SOON_DAYS } from "@/lib/promotions/deals-page"
import { dealCardDaysText, dealDaysText } from "@/lib/promotions/deal-days"
import { addDays } from "@/lib/promotions/deal-times"
import {
  dealNextLine,
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

/** The tag over a card's photo: where the deal stands in one or two words. */
export type DealBadge = {
  /** Which of the three it is, so the card can colour its dot. */
  tone: "ending" | "now" | "soon"
  text: string
}

/** A card on the Deals page, with its words for this moment. */
export type ListedDeal = PublicDealCard & {
  /** Inside its days, or not started. The list never holds an ended one. */
  stage: "on" | "soon"
  /** "Until Sun, Oct 12", "Starts Thu, Oct 1". */
  daysText: string
  /** "On now · until 6 PM", "Next: today at 4 PM", or null. */
  nowText: string | null
  /** The card's foot, right-hand cell: "Next" over "Tomorrow, 11 AM". */
  nextLine: { label: string; text: string } | null
  /** "Ending soon", "On now" or "Starting soon", or null while it is neither. */
  badge: DealBadge | null
}

export type DealView = {
  site: PublicSite
  /**
   * The deal without its code. The code never reaches the page: Show code asks
   * for it, through `shownCodeAt`.
   */
  deal: Omit<PublicDeal, "code">
  /** The page draws a Show code button. */
  hasCode: boolean
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
    const nowText = dealNowText(deal, now)
    return {
      ...deal,
      stage,
      daysText: dealCardDaysText(deal, stage, today),
      nowText,
      nextLine: dealNextLine(deal, now),
      badge: dealBadgeAt(deal, stage, today, nowText),
    }
  })
}

/**
 * The tag over a card's photo. **Ending soon wins**, because a deal that is
 * both on now and gone on Thursday is worth crossing town for today, and the
 * card already says "On now" in its foot.
 *
 * "Ending soon" is its last day today or within the next two, the same three
 * days the chip counts. A deal that has not started yet says "Starting soon"
 * whatever its last day is, one running this minute says "On now", and
 * anything else is left bare rather than tagged with something it is not.
 */
function dealBadgeAt(
  deal: PublicDealCard,
  stage: "on" | "soon",
  today: string,
  nowText: string | null
): DealBadge | null {
  // Not started beats ending, because a deal that opens tomorrow and closes
  // tomorrow is one to come back for, not one about to be lost.
  if (stage === "soon") return { tone: "soon", text: "Starting soon" }
  if (deal.endDate && deal.endDate <= addDays(today, ENDING_SOON_DAYS - 1)) {
    return { tone: "ending", text: "Ending soon" }
  }
  // The one line the server already worked out for "is it running this
  // minute", rather than a second rule here that could answer differently.
  return nowText?.startsWith("On now") ? { tone: "now", text: "On now" } : null
}

/**
 * The code Show code may hand over at `at`, or empty: none once the deal is
 * over, and none while each visitor claims their own.
 */
export function shownCodeAt(page: PublicDealPage, at: Date): string {
  const ended =
    dealStage(page.deal, wallClockAt(page.timeZone, at)) === "ended"
  return ended || page.deal.takesClaims ? "" : page.deal.code
}

/** A cached deal page as a visitor sees it at `at`. */
export function dealViewAt(page: PublicDealPage, at: Date): DealView {
  const now = wallClockAt(page.timeZone, at)
  const stage = dealStage(page.deal, now)
  const ended = stage === "ended"
  const { code: _code, ...deal } = page.deal
  return {
    site: page.site,
    deal,
    hasCode: shownCodeAt(page, at) !== "",
    ended,
    upcoming: stage === "soon",
    days: dealDaysText(page.deal),
    times: dealTimesLines(page.deal.times),
    nowText: dealNowText(page.deal, now),
  }
}
