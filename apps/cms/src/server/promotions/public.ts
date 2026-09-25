import { and, asc, eq, gte, isNull, or, sql } from "drizzle-orm"

import { DEALS_PAGE_SIZE } from "@/lib/promotions/deals-page"
import { cleanListingHours } from "@/lib/directory/listing-details"
import type { DealDays } from "@/lib/promotions/deal-days"
import {
  addDays,
  weekdayOf,
  type DealTimes,
} from "@/lib/promotions/deal-times"
import { readPageVisibility } from "@/server/content/pages"
import { db, type CustomShellDb } from "@/server/db"
import type { PublicSite, VisitorSite } from "@/server/directory/public"
import { cachedPublicDirectoryRead } from "@/server/directory/public-cache"
import { directoryListings } from "@/server/directory/schema"
import { siteTimeZone } from "@/server/directory/settings"
import { listingOfPromotion, sitePromotions } from "@/server/promotions/schema"

/**
 * What a visitor may read of a site's deals. Every read takes the site from
 * the visited address and goes through `listedDealsOnSite`, so a draft deal,
 * and a deal at a draft listing, is missing rather than hidden.
 * `private.test.ts` fails when a new export here is not proven to leave both
 * out.
 *
 * The Deals page and a deal's page leave the on/off switch to their
 * endpoint, because a members-only switch depends on who is asking and these
 * answers are cached for everyone. Whether a deal is over is worked out by the
 * endpoint too, after the cache, so a cached answer never shows an ended
 * deal's code.
 */

/** A deal as a card on the Deals page. */
export type PublicDealCard = DealDays & {
  id: string
  title: string
  /** "20% off", or empty on a deal made before headlines, shown as "Deal". */
  headline: string
  slug: string
  coverImage: string
  listingTitle: string
  /** The listing's own photo, or empty. */
  listingImage: string
  /** The weekdays and hours it runs. Every day off means all day, every day. */
  times: DealTimes
}

export type PublicDeal = PublicDealCard & {
  description: string
  code: string
  smallPrint: string
  /** The listing's street address line, or empty. */
  listingAddress: string
  /**
   * The listing's address part, when the directory is open to everyone so a
   * link to it opens. Otherwise the listing's name is plain text.
   */
  listingSlug: string | null
}

export type PublicDealPage = {
  site: PublicSite
  deal: PublicDeal
  /** The zone the deal's days are read in, like 'America/Toronto'. */
  timeZone: string
}

export type DealsList = {
  site: PublicSite
  deals: PublicDealCard[]
  total: number
  page: number
  pageSize: number
}

/**
 * Published, on this site, at one of the site's published listings: what a
 * visitor may see of a deal at all. Every read here goes through this one
 * filter, and joins the listing on `listingOfPromotion` for it to read.
 */
function listedDealsOnSite(siteId: string) {
  return and(
    eq(sitePromotions.workspaceId, siteId),
    eq(sitePromotions.status, "published"),
    eq(directoryListings.status, "published")
  )
}

const dealCardColumns = {
  id: sitePromotions.id,
  title: sitePromotions.title,
  headline: sitePromotions.headline,
  slug: sitePromotions.slug,
  coverImage: sitePromotions.coverImage,
  startDate: sitePromotions.startDate,
  endDate: sitePromotions.endDate,
  listingTitle: directoryListings.title,
  listingImage: directoryListings.featuredImage,
  times: sitePromotions.times,
}

/** A row's stored times, read the one way every read reads them. */
function withTimes<Row extends { times: unknown }>(
  row: Row
): Omit<Row, "times"> & { times: DealTimes } {
  return { ...row, times: cleanListingHours(row.times) }
}

/**
 * Whether this visitor may read the site's deals, and why: "everyone" when
 * the Deals page is open to all, "members" when it is kept for members and
 * they are signed in, and null otherwise. `isSignedIn` is only asked in the
 * members case.
 */
export async function dealsAccessFor(
  siteId: string,
  isSignedIn: () => Promise<boolean>,
  database: CustomShellDb = db
): Promise<"everyone" | "members" | null> {
  const visibility = await readPageVisibility(siteId, "/deals", database)
  if (visibility === "everyone") return "everyone"
  if (visibility === "members" && (await isSignedIn())) return "members"
  return null
}

/**
 * Whether a deal whose last day was yesterday is still running its last
 * night: yesterday's first or second stretch runs past midnight and has not
 * closed by `clock`. The same rule as `dealEndsAt`, written for the database.
 */
function lastNightStillOn(yesterday: string, clock: string) {
  const day = sql`${sitePromotions.times} -> ${weekdayOf(yesterday)}::text`
  const overnight = (shift: typeof day) =>
    sql`((${shift} ->> 'close') <= (${shift} ->> 'open') and (${shift} ->> 'close') > ${clock})`
  return and(
    eq(sitePromotions.endDate, yesterday),
    sql`(${overnight(day)} or ${overnight(sql`(${day} -> 'second')`)})`
  )
}

/**
 * One page of the deals not over at `now`, the site's "2026-09-24T16:30": the
 * ones inside their days first, ending soonest first with no end day last,
 * then the ones starting on a later day, soonest first. A deal is over at
 * midnight after its last day, or when that night's stretch closes if it runs
 * past midnight. `now` is part of the cache's key, so a deal that has just
 * ended is gone the next time the page is read, with no job to hide it.
 */
export function readDeals(
  site: VisitorSite,
  page: number,
  now: string,
  database: CustomShellDb = db
): Promise<DealsList> {
  const today = now.slice(0, 10)
  return cachedPublicDirectoryRead(
    site.id,
    "deals",
    { site: { name: site.name, url: site.url }, page, now },
    async () => {
      const where = and(
        listedDealsOnSite(site.id),
        or(
          isNull(sitePromotions.endDate),
          gte(sitePromotions.endDate, today),
          lastNightStillOn(addDays(today, -1), now.slice(11))
        )
      )
      const onNow = sql`${sitePromotions.startDate} <= ${today}::date`
      const [rows, [countRow]] = await Promise.all([
        database
          .select(dealCardColumns)
          .from(sitePromotions)
          .innerJoin(directoryListings, listingOfPromotion)
          .where(where)
          .orderBy(
            sql`case when ${onNow} then 0 else 1 end`,
            // On now: the one ending first. Coming: the one starting first.
            sql`case when ${onNow} then ${sitePromotions.endDate} else ${sitePromotions.startDate} end asc nulls last`,
            asc(sitePromotions.startDate),
            // The id breaks ties, so pages never overlap.
            asc(sitePromotions.id)
          )
          .limit(DEALS_PAGE_SIZE)
          .offset((page - 1) * DEALS_PAGE_SIZE),
        database
          .select({ total: sql<number>`count(*)::int` })
          .from(sitePromotions)
          .innerJoin(directoryListings, listingOfPromotion)
          .where(where),
      ])
      return {
        site: { name: site.name, url: site.url },
        deals: rows.map(withTimes),
        total: countRow?.total ?? 0,
        page,
        pageSize: DEALS_PAGE_SIZE,
      }
    }
  )
}

/**
 * One deal by its address, ended ones included, or null. An ended deal's page
 * still opens and says so; its endpoint leaves the code out.
 */
export function readPublicDeal(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb = db
): Promise<PublicDealPage | null> {
  return cachedPublicDirectoryRead(
    site.id,
    "deal",
    { site: { name: site.name, url: site.url }, slug },
    async () => {
      const [found] = await database
        .select({
          ...dealCardColumns,
          description: sitePromotions.description,
          code: sitePromotions.code,
          smallPrint: sitePromotions.smallPrint,
          listingAddress: sql<string>`coalesce(${directoryListings.contactLinks}->>'address', '')`,
          listingSlug: directoryListings.slug,
        })
        .from(sitePromotions)
        .innerJoin(directoryListings, listingOfPromotion)
        .where(and(listedDealsOnSite(site.id), eq(sitePromotions.slug, slug)))
        .limit(1)
      if (!found) return null
      const [timeZone, directoryVisibility] = await Promise.all([
        siteTimeZone(site.id, database),
        readPageVisibility(site.id, "/directory", database),
      ])
      return {
        site: { name: site.name, url: site.url },
        deal: {
          ...withTimes(found),
          // A directory kept from visitors is never linked into.
          listingSlug:
            directoryVisibility === "everyone" ? found.listingSlug : null,
        },
        timeZone,
      }
    }
  )
}
