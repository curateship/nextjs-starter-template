import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm"

import {
  formatDirectoryNearPoint,
  type DirectoryNearPoint,
} from "@/lib/directory/public-search"
import {
  DEALS_PAGE_SIZE,
  ENDING_SOON_DAYS,
} from "@/lib/promotions/deals-page"
import { cleanListingHours } from "@/lib/directory/listing-details"
import type { DealDays } from "@/lib/promotions/deal-days"
import { shownHeadline } from "@/lib/promotions/deal-headline"
import {
  addDays,
  weekdayOf,
  type DealTimes,
} from "@/lib/promotions/deal-times"
import { readPageVisibility } from "@/server/content/pages"
import { db, type CustomShellDb } from "@/server/db"
import type { PublicSite, VisitorSite } from "@/server/directory/public"
import { cachedPublicDirectoryRead } from "@/server/directory/public-cache"
import { distanceKmFrom } from "@/server/directory/distance"
import {
  categories,
  categoryRelationships,
  directoryListings,
  LISTING_CONTENT_TYPE,
} from "@/server/directory/schema"
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
  /**
   * How far its listing is from the visitor's chosen point, in kilometres.
   * Only while the Deals page is narrowed to a distance.
   */
  distanceKm?: number
}

export type PublicDeal = PublicDealCard & {
  /** Set when the deal was ended early; its page then says it has ended. */
  endedAt: Date | null
  /** Each visitor claims their own code, so the deal's shared code is never shown. */
  takesClaims: boolean
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
 * Not over at `now`, the site's "2026-09-24T16:30": not ended early, and its
 * end day is today or later, or was yesterday while that night still runs.
 * Every public list of deals goes through this, the same rule as `dealStage`.
 */
function dealIsLiveAt(now: string) {
  const today = now.slice(0, 10)
  return and(
    isNull(sitePromotions.endedAt),
    or(
      isNull(sitePromotions.endDate),
      gte(sitePromotions.endDate, today),
      lastNightStillOn(addDays(today, -1), now.slice(11))
    )
  )
}

/**
 * Running at `now`, the site's "2026-10-06T16:30", by the deal's times: the
 * same rule as `dealNowText`'s "On now", written for the database so a list
 * narrowed to it pages and counts right. Inside its days with no times at
 * all; or one of today's stretches has started and not closed; or one of last
 * night's runs past midnight and has not closed yet. A stretch that ends at or
 * before its start runs past midnight, and one whose start and end match runs
 * for 24 hours.
 */
function runningAt(now: string) {
  const today = now.slice(0, 10)
  const clock = now.slice(11)
  const yesterday = addDays(today, -1)
  const times = sitePromotions.times
  const onDay = (day: string) =>
    sql`(${sitePromotions.startDate} <= ${day}::date and (${sitePromotions.endDate} is null or ${sitePromotions.endDate} >= ${day}::date))`
  const shiftsOf = (day: string) => {
    const first = sql`(${times} -> ${weekdayOf(day)}::text)`
    return [first, sql`(${first} -> 'second')`]
  }
  // Started today by now, and not yet closed today or running past midnight.
  const startedToday = (shift: SQL) =>
    sql`((${shift} ->> 'open') <= ${clock} and ((${shift} ->> 'close') <= (${shift} ->> 'open') or ${clock} < (${shift} ->> 'close')))`
  // Began last night, runs past midnight, and not closed yet.
  const fromLastNight = (shift: SQL) =>
    sql`((${shift} ->> 'close') <= (${shift} ->> 'open') and ${clock} < (${shift} ->> 'close'))`
  const noTimes = sql`not exists (select 1 from jsonb_each(${times}) as day(key, value) where day.value <> 'null'::jsonb)`
  const [todayFirst, todaySecond] = shiftsOf(today)
  const [lastFirst, lastSecond] = shiftsOf(yesterday)
  return sql`(
    (${noTimes} and ${onDay(today)})
    or (not ${noTimes} and ${onDay(today)} and (${startedToday(todayFirst!)} or ${startedToday(todaySecond!)}))
    or (not ${noTimes} and ${onDay(yesterday)} and (${fromLastNight(lastFirst!)} or ${fromLastNight(lastSecond!)}))
  )`
}

/** At a listing filed directly under this category, not one of its children. */
function atListingIn(
  siteId: string,
  categoryId: string | SQLWrapper,
  database: CustomShellDb
) {
  return exists(
    database
      .select({ one: sql`1` })
      .from(categoryRelationships)
      .where(
        and(
          eq(categoryRelationships.workspaceId, siteId),
          eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE),
          eq(categoryRelationships.contentId, sitePromotions.listingId),
          eq(categoryRelationships.categoryId, categoryId)
        )
      )
  )
}

/** What the Deals page can be narrowed to. Every part is optional. */
type DealsFilter = {
  categoryId?: string
  /** Running right now, or ending within three days by the site's calendar. */
  on?: "now" | "ending"
  /** Only deals at listings with a pin this close, in kilometres. */
  near?: DirectoryNearPoint
  radius?: number
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
  database: CustomShellDb = db,
  only: DealsFilter = {}
): Promise<DealsList> {
  const today = now.slice(0, 10)
  const near = only.near && only.radius ? only.near : null
  const radius = near ? only.radius! : null
  return cachedPublicDirectoryRead(
    site.id,
    "deals",
    {
      site: { name: site.name, url: site.url },
      page,
      now,
      categoryId: only.categoryId ?? null,
      on: only.on ?? null,
      near: near ? formatDirectoryNearPoint(near) : null,
      radius,
    },
    async () => {
      const distanceKm = near
        ? distanceKmFrom(
            near,
            directoryListings.latitude,
            directoryListings.longitude
          ).mapWith(Number)
        : null
      const where = and(
        listedDealsOnSite(site.id),
        dealIsLiveAt(now),
        only.categoryId
          ? atListingIn(site.id, only.categoryId, database)
          : undefined,
        only.on === "now" ? runningAt(now) : undefined,
        only.on === "ending"
          ? lte(
              sitePromotions.endDate,
              addDays(today, ENDING_SOON_DAYS - 1)
            )
          : undefined,
        // A listing with no pin measures as null, never within the radius.
        distanceKm ? sql`${distanceKm} <= ${radius}` : undefined
      )
      const onNow = sql`${sitePromotions.startDate} <= ${today}::date`
      const [rows, [countRow]] = await Promise.all([
        database
          .select({
            ...dealCardColumns,
            ...(distanceKm ? { distanceKm } : {}),
          })
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
        deals: rows.map(({ distanceKm: km, ...row }) => ({
          ...withTimes(row),
          ...(km == null ? {} : { distanceKm: km }),
        })),
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
          endedAt: sitePromotions.endedAt,
          takesClaims: sitePromotions.takesClaims,
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

/** How many deals a listing's "Deals here" box shows. */
const DEALS_ON_A_LISTING = 3

/**
 * The live deals at one listing, for its "Deals here" box: the ones on now
 * first, the same order as the Deals page, three at most. Read after the
 * listing page's cache, by the site's clock, so `now` is part of the key.
 */
export function readListingDeals(
  site: VisitorSite,
  listingId: string,
  now: string,
  database: CustomShellDb = db
): Promise<PublicDealCard[]> {
  const today = now.slice(0, 10)
  return cachedPublicDirectoryRead(
    site.id,
    "listing-deals",
    { listingId, now },
    async () => {
      const onNow = sql`${sitePromotions.startDate} <= ${today}::date`
      const rows = await database
        .select(dealCardColumns)
        .from(sitePromotions)
        .innerJoin(directoryListings, listingOfPromotion)
        .where(
          and(
            listedDealsOnSite(site.id),
            dealIsLiveAt(now),
            eq(sitePromotions.listingId, listingId)
          )
        )
        .orderBy(
          sql`case when ${onNow} then 0 else 1 end`,
          sql`case when ${onNow} then ${sitePromotions.endDate} else ${sitePromotions.startDate} end asc nulls last`,
          asc(sitePromotions.id)
        )
        .limit(DEALS_ON_A_LISTING)
      return rows.map(withTimes)
    }
  )
}

/**
 * The headline of each listing's newest deal on now, for the Deal tag on
 * listing cards. **One query for the whole page of cards**, whatever its
 * size, and never one per card. Listings with no live deal are left out.
 */
export async function dealHeadlinesFor(
  siteId: string,
  listingIds: string[],
  now: string,
  database: CustomShellDb = db
): Promise<Map<string, string>> {
  if (listingIds.length === 0) return new Map()
  const rows = await database
    .selectDistinctOn([sitePromotions.listingId], {
      listingId: sitePromotions.listingId,
      headline: sitePromotions.headline,
    })
    .from(sitePromotions)
    .innerJoin(directoryListings, listingOfPromotion)
    .where(
      and(
        listedDealsOnSite(siteId),
        dealIsLiveAt(now),
        // On now, not merely coming: a tag says the place has a deal today.
        lte(sitePromotions.startDate, now.slice(0, 10)),
        inArray(sitePromotions.listingId, listingIds)
      )
    )
    .orderBy(
      sitePromotions.listingId,
      desc(sitePromotions.publishedAt),
      desc(sitePromotions.id)
    )
  return new Map(rows.map((row) => [row.listingId, shownHeadline(row.headline)]))
}

/**
 * The newest live deals, newest published first, for a category page and a
 * home page row. `categoryId` keeps only deals at listings filed directly
 * under that category, not its children's, the same rule as its listings and
 * events. Read after the page cache, by the site's clock.
 */
export function readNewestDeals(
  site: VisitorSite,
  now: string,
  options: { categoryId?: string | null; limit: number },
  database: CustomShellDb = db
): Promise<PublicDealCard[]> {
  const categoryId = options.categoryId ?? null
  const limit = Math.min(Math.max(options.limit, 1), 24)
  return cachedPublicDirectoryRead(
    site.id,
    "newest-deals",
    { now, categoryId, limit },
    async () => {
      const rows = await database
        .select(dealCardColumns)
        .from(sitePromotions)
        .innerJoin(directoryListings, listingOfPromotion)
        .where(
          and(
            listedDealsOnSite(site.id),
            dealIsLiveAt(now),
            categoryId
              ? atListingIn(site.id, categoryId, database)
              : undefined
          )
        )
        .orderBy(desc(sitePromotions.publishedAt), desc(sitePromotions.id))
        .limit(limit)
      return rows.map(withTimes)
    }
  )
}

/** A category offered as a filter chip on the Deals page. */
export type DealCategory = { id: string; name: string; slug: string }

/**
 * The categories the Deals page offers as filters: every category with a
 * live deal at a listing filed directly under it, in the admin's order. A
 * category holding only drafts, deals at draft listings or ended deals is left
 * out, so a chip never leads to an empty list or gives a hidden deal away.
 */
export function readDealCategories(
  siteId: string,
  now: string,
  database: CustomShellDb = db
): Promise<DealCategory[]> {
  return cachedPublicDirectoryRead(siteId, "deal-categories", { now }, () =>
    database
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
      })
      .from(categories)
      .where(
        and(
          eq(categories.workspaceId, siteId),
          exists(
            database
              .select({ one: sql`1` })
              .from(sitePromotions)
              .innerJoin(directoryListings, listingOfPromotion)
              .where(
                and(
                  listedDealsOnSite(siteId),
                  dealIsLiveAt(now),
                  atListingIn(siteId, categories.id, database)
                )
              )
          )
        )
      )
      .orderBy(asc(categories.displayOrder), asc(categories.name))
  )
}

/**
 * One deal by its id, for a visitor reporting a problem on a page they
 * opened: only one a visitor could have read here, ended ones included, since
 * "it has ended" is one of the reasons. Null otherwise, never a refusal that
 * says a draft exists.
 */
export async function findReportableDeal(
  siteId: string,
  id: string,
  database: CustomShellDb = db
): Promise<{ id: string; title: string } | null> {
  const [row] = await database
    .select({ id: sitePromotions.id, title: sitePromotions.title })
    .from(sitePromotions)
    .innerJoin(directoryListings, listingOfPromotion)
    .where(and(listedDealsOnSite(siteId), eq(sitePromotions.id, id)))
    .limit(1)
  return row ?? null
}
