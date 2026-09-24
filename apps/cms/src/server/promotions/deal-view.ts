import {
  dealDaysText,
  dealStage,
  siteToday,
} from "@/lib/promotions/deal-days"
import type { PublicSite } from "@/server/directory/public"
import type { PublicDeal, PublicDealPage } from "@/server/promotions/public"

export type DealView = {
  site: PublicSite
  /** The code is empty once the deal has ended, so it never reaches the page. */
  deal: PublicDeal
  ended: boolean
  /** Not started yet by the site's calendar. */
  upcoming: boolean
  /** "Oct 3, 2026 to Oct 12, 2026", written once here for the page. */
  days: string
}

/**
 * A cached deal page as a visitor sees it at `at`, by the site's calendar.
 * Worked out after the cache on every request, so a cached answer never shows
 * an ended deal's code.
 */
export function dealViewAt(page: PublicDealPage, at: Date): DealView {
  const stage = dealStage(page.deal, siteToday(page.timeZone, at))
  const ended = stage === "ended"
  return {
    site: page.site,
    deal: ended ? { ...page.deal, code: "" } : page.deal,
    ended,
    upcoming: stage === "soon",
    days: dealDaysText(page.deal),
  }
}
