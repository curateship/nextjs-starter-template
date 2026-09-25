import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm"

import { isValidDateString } from "@/lib/events/calendar-grid"
import { slugFromTitle, slugProblem } from "@/lib/directory/slugs"
import {
  cleanListingHours,
  LISTING_WEEKDAY_LABELS,
  LISTING_WEEKDAYS,
  type ListingHours,
  type ListingShift,
} from "@/lib/directory/listing-details"
import { wallClockAt } from "@/lib/events/event-time"
import type { DealDays } from "@/lib/promotions/deal-days"
import { readClaimLimit } from "@/lib/promotions/claim-fields"
import {
  MAX_PROMOTION_CODE,
  MAX_PROMOTION_DESCRIPTION,
  MAX_PROMOTION_SMALL_PRINT,
  MAX_PROMOTION_TITLE,
} from "@/lib/promotions/deal-limits"
import type { DealTimes } from "@/lib/promotions/deal-times"
import {
  builtHeadline,
  isDealType,
  MAX_DEAL_HEADLINE,
  readDealAmount,
  type DealType,
} from "@/lib/promotions/deal-headline"
import {
  DEFAULT_PROMOTION_SORT,
  promotionSortDirection,
  type PromotionSortColumn,
} from "@/lib/promotions/promotion-sort"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import { directoryListings } from "@/server/directory/schema"
import { siteTimeZone } from "@/server/directory/settings"
import {
  firstFreeSlug as firstFreeSlugRule,
  requireFreeSlug as requireFreeSlugRule,
} from "@/server/directory/slug-rules"
import { listingChoice, type ListingChoice } from "@/server/posts/posts"
import {
  listingOfPromotion,
  sitePromotions,
  type PromotionRow,
} from "@/server/promotions/schema"
import { customShellUsers } from "@/server/schema"

/**
 * The admin's side of deals. Every read and write takes the site first and
 * filters on it, so one site's deals never reach another site's screen.
 *
 * Saving or deleting a published deal clears the public page cache, because
 * the Deals page and each deal's page are cached.
 */

export type PromotionStatus = "draft" | "published"

export type SitePromotion = DealDays & {
  id: string
  listingId: string
  title: string
  slug: string
  description: string
  coverImage: string
  code: string
  smallPrint: string
  /** Null on a deal made before types existed. */
  dealType: DealType | null
  /** The number a money off or percent off headline is built from. */
  amount: number | null
  /** "20% off". Empty only on a deal made before types existed. */
  headline: string
  /** The weekdays and hours it runs. Every day off means all day, every day. */
  times: DealTimes
  /** Visitors claim it with a name and email, each getting their own code. */
  takesClaims: boolean
  /** How many can claim it, or null for no limit. */
  claimLimit: number | null
  status: PromotionStatus
  publishedAt: Date | null
  createdByUserId: string | null
  /** The listing owner who sent it, or null for an admin's own deal. */
  ownerUserId: string | null
  /** Set by "End now" or an admin; the deal is over from then. */
  endedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * A row in Admin → Promotions: the deal without its long words, which the
 * window loads itself, plus its listing's current name.
 */
export type PromotionSummary = Omit<
  SitePromotion,
  "description" | "smallPrint"
> & {
  listingTitle: string
  listingStatus: "draft" | "published"
}

/** Everything the window saves. The whole deal goes every time. */
export type PromotionInput = DealDays & {
  title: string
  /** Left out on a new deal to take a free address from the title. */
  slug?: string
  listingId: string
  description: string
  coverImage: string
  code: string
  smallPrint: string
  /** One of `DEAL_TYPES`, checked by `cleanDealHeadline`. Empty while none is picked. */
  dealType: string
  /** As typed. Read only for money off and percent off. */
  amount: string
  /** As typed. Read only for the types whose headline is typed. */
  headline: string
  /** Checked by `cleanDealTimes`, which says what is wrong in words. Left out means all day. */
  times?: unknown
  takesClaims?: boolean
  /** As typed. Read only while claims are on. */
  claimLimit?: string
  status: PromotionStatus
}

const PROMOTION_NOUN = { one: "deal", many: "deals" }

function toPromotion(row: PromotionRow): SitePromotion {
  return {
    id: row.id,
    listingId: row.listingId,
    title: row.title,
    slug: row.slug,
    description: row.description,
    coverImage: row.coverImage,
    startDate: row.startDate,
    endDate: row.endDate,
    code: row.code,
    smallPrint: row.smallPrint,
    dealType: isDealType(row.dealType) ? row.dealType : null,
    amount: row.amount,
    headline: row.headline,
    times: cleanListingHours(row.times),
    takesClaims: row.takesClaims,
    claimLimit: row.claimLimit,
    status: row.status === "published" ? "published" : "draft",
    publishedAt: row.publishedAt,
    createdByUserId: row.createdByUserId,
    ownerUserId: row.ownerUserId,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * The days as they are stored, or a refusal the admin can act on. An empty
 * end day means the deal has no end.
 */
export function cleanDealDays(input: {
  startDate: string
  endDate?: string | null
}): DealDays {
  const startDate = input.startDate.trim()
  if (!isValidDateString(startDate)) {
    throw new Error("Pick the first day of the deal.")
  }
  const endDate = input.endDate?.trim() || null
  if (endDate && !isValidDateString(endDate)) {
    throw new Error("The end day is not a real day.")
  }
  if (endDate && endDate < startDate) {
    throw new Error("The deal ends before it starts. Pick a later end day.")
  }
  return { startDate, endDate }
}

/**
 * The type and headline as stored, or a refusal the admin can act on. Every
 * save needs a type, an old deal's included. Money off and percent off build
 * their headline from the number; the rest keep what was typed.
 */
export function cleanDealHeadline(input: {
  dealType: string
  amount: string
  headline: string
}): { dealType: DealType; amount: number | null; headline: string } {
  const dealType = input.dealType
  if (!isDealType(dealType)) throw new Error("Pick the type of deal.")
  if (dealType === "money_off" || dealType === "percent_off") {
    const amount = readDealAmount(dealType, input.amount)
    return { dealType, amount, headline: builtHeadline(dealType, amount) }
  }
  const headline = input.headline.trim()
  if (!headline) {
    throw new Error("Type the headline, the few words a card shows in big type.")
  }
  if (headline.length > MAX_DEAL_HEADLINE) {
    throw new Error(`Keep the headline to ${MAX_DEAL_HEADLINE} characters.`)
  }
  return { dealType, amount: null, headline }
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * The times as stored, or a refusal naming the day. A day that is switched on
 * needs a start and an end; the shape is a listing's opening hours, so a
 * listing's hours copy across as they are.
 */
export function cleanDealTimes(value: unknown): DealTimes {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const shiftOf = (raw: unknown, what: string): ListingShift | null => {
    if (raw === null || raw === undefined) return null
    const entry =
      typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {}
    const open = typeof entry.open === "string" ? entry.open.trim() : ""
    const close = typeof entry.close === "string" ? entry.close.trim() : ""
    if (!CLOCK.test(open) || !CLOCK.test(close)) {
      throw new Error(`Give ${what} a start and an end time.`)
    }
    return { open, close }
  }
  const times = {} as DealTimes
  for (const day of LISTING_WEEKDAYS) {
    times[day] = shiftOf(source[day], LISTING_WEEKDAY_LABELS[day])
  }
  return times
}

function cleanTitle(raw: string): string {
  const title = raw.trim().slice(0, MAX_PROMOTION_TITLE)
  if (!title) throw new Error("A deal needs a title.")
  return title
}

async function slugIsTaken(
  workspaceId: string,
  slug: string,
  exceptId: string | null,
  database: CustomShellDb
): Promise<boolean> {
  const [row] = await database
    .select({ id: sitePromotions.id })
    .from(sitePromotions)
    .where(
      and(
        eq(sitePromotions.workspaceId, workspaceId),
        eq(sitePromotions.slug, slug),
        exceptId ? ne(sitePromotions.id, exceptId) : undefined
      )
    )
    .limit(1)
  return Boolean(row)
}

/** A deal's own words, headline, days and times, as the window sends them. */
export type DealContentInput = {
  title: string
  description: string
  coverImage: string
  code: string
  smallPrint: string
  dealType: string
  amount: string
  headline: string
  startDate: string
  endDate?: string | null
  times?: unknown
  takesClaims?: boolean
  /** As typed. Read only while claims are on. */
  claimLimit?: string
}

/**
 * A deal's content as stored, or the first refusal in the order the window
 * shows the boxes: title, headline, days, times. The admin's save and an
 * owner's request both go through this, so both are held to the same rules.
 */
export function cleanDealContent(input: DealContentInput) {
  const title = cleanTitle(input.title)
  const headline = cleanDealHeadline(input)
  const days = cleanDealDays(input)
  return {
    title,
    description: input.description.trim().slice(0, MAX_PROMOTION_DESCRIPTION),
    coverImage: input.coverImage.trim().slice(0, 600),
    code: input.code.trim().slice(0, MAX_PROMOTION_CODE),
    smallPrint: input.smallPrint.trim().slice(0, MAX_PROMOTION_SMALL_PRINT),
    ...headline,
    ...days,
    times: cleanDealTimes(input.times),
    takesClaims: Boolean(input.takesClaims),
    // Only while claims are on: a leftover typo in a hidden box never stops a save.
    claimLimit: input.takesClaims ? readClaimLimit(input.claimLimit ?? "") : null,
  }
}

/**
 * The columns every admin save writes, checked. The listing must be one of
 * this site's, so a deal can never point at another site's place. The title
 * is refused before the listing, the way the window shows them.
 */
async function cleanValues(
  workspaceId: string,
  input: PromotionInput,
  database: CustomShellDb
) {
  cleanTitle(input.title)
  if (!input.listingId) throw new Error("Pick the listing the deal is at.")
  const listing = await listingChoice(workspaceId, input.listingId, database)
  if (!listing) throw new Error("That listing is not on this site any more.")
  return {
    ...cleanDealContent(input),
    listingId: listing.id,
    status: input.status,
  }
}

export async function listPromotions(
  workspaceId: string,
  options: {
    search?: string
    status?: PromotionStatus
    sort?: PromotionSortColumn
    direction?: "asc" | "desc"
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
): Promise<{ promotions: PromotionSummary[]; total: number; now: string }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const search = options.search?.trim()

  const filters = [eq(sitePromotions.workspaceId, workspaceId)]
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(sitePromotions.title, pattern),
      ilike(sitePromotions.slug, pattern),
      ilike(sitePromotions.code, pattern),
      ilike(directoryListings.title, pattern)
    )
    if (match) filters.push(match)
  }
  if (options.status) filters.push(eq(sitePromotions.status, options.status))
  const where = and(...filters)

  const sort = options.sort ?? DEFAULT_PROMOTION_SORT
  // With no direction given, each column runs the way the screen's arrow says.
  const order =
    (options.direction ?? promotionSortDirection(sort)) === "asc" ? asc : desc
  const column = {
    title: sitePromotions.title,
    listing: directoryListings.title,
    status: sitePromotions.status,
    start: sitePromotions.startDate,
    updated: sitePromotions.updatedAt,
  }[sort]

  const [rows, [countRow], timeZone] = await Promise.all([
    database
      .select({
        row: sitePromotions,
        listingTitle: directoryListings.title,
        listingStatus: directoryListings.status,
      })
      .from(sitePromotions)
      .innerJoin(directoryListings, listingOfPromotion)
      .where(where)
      // The id breaks ties, so a page boundary never shows a deal twice.
      .orderBy(order(column), asc(sitePromotions.id))
      .limit(limit)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(sitePromotions)
      .innerJoin(directoryListings, listingOfPromotion)
      .where(where),
    siteTimeZone(workspaceId, database),
  ])

  return {
    promotions: rows.map(({ row, listingTitle, listingStatus }) => {
      const {
        description: _description,
        smallPrint: _smallPrint,
        ...rest
      } = toPromotion(row)
      return {
        ...rest,
        listingTitle,
        listingStatus: listingStatus === "published" ? "published" : "draft",
      }
    }),
    total: countRow?.total ?? 0,
    now: wallClockAt(timeZone, new Date()),
  }
}

/** One deal for its window: the deal, its listing as it is now, and who wrote it. */
export type PromotionForEdit = {
  promotion: SitePromotion
  listing: ListingChoice | null
  /** The writer's name, or null once that account is gone. */
  createdBy: string | null
}

export async function findPromotion(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<PromotionForEdit | null> {
  const [found] = await database
    .select({
      row: sitePromotions,
      creatorName: customShellUsers.name,
      creatorEmail: customShellUsers.email,
    })
    .from(sitePromotions)
    .leftJoin(
      customShellUsers,
      eq(customShellUsers.id, sitePromotions.createdByUserId)
    )
    .where(
      and(
        eq(sitePromotions.id, id),
        eq(sitePromotions.workspaceId, workspaceId)
      )
    )
    .limit(1)
  if (!found) return null
  const promotion = toPromotion(found.row)
  return {
    promotion,
    listing: await listingChoice(workspaceId, promotion.listingId, database),
    createdBy: found.creatorName?.trim() || found.creatorEmail || null,
  }
}

/**
 * A new deal, saved whole. The address is the one typed, refused when taken,
 * or a free one from the title, numbered when the title's is taken.
 */
export async function createPromotion(
  workspaceId: string,
  userId: string,
  input: PromotionInput,
  database: CustomShellDb = db
): Promise<SitePromotion> {
  const values = await cleanValues(workspaceId, input, database)
  const isTaken = (candidate: string) =>
    slugIsTaken(workspaceId, candidate, null, database)
  const chosen = input.slug?.trim()
  let slug: string
  if (chosen) {
    await requireFreeSlugRule(chosen, isTaken, PROMOTION_NOUN)
    slug = chosen
  } else {
    // A title with no letters or numbers, like "🍝🍝", gives no address.
    const wanted = slugFromTitle(values.title)
    const problem = slugProblem(wanted)
    if (problem) throw new Error(problem)
    slug = await firstFreeSlugRule(wanted, isTaken, PROMOTION_NOUN)
  }

  const at = now()
  const [row] = await database
    .insert(sitePromotions)
    .values({
      id: uuid(),
      workspaceId,
      ...values,
      slug,
      publishedAt: values.status === "published" ? at : null,
      createdByUserId: userId,
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  if (!row) throw new Error("The deal was not created.")
  if (row.status === "published") clearPublicDirectoryCache(workspaceId)
  return toPromotion(row)
}

export async function updatePromotion(
  workspaceId: string,
  id: string,
  input: PromotionInput & { slug: string },
  database: CustomShellDb = db
): Promise<SitePromotion> {
  const values = await cleanValues(workspaceId, input, database)
  const slug = input.slug.trim()
  await requireFreeSlugRule(
    slug,
    (candidate) => slugIsTaken(workspaceId, candidate, id, database),
    PROMOTION_NOUN
  )

  const at = now()
  const [row] = await database
    .update(sitePromotions)
    .set({
      ...values,
      slug,
      // The first publish dates the deal; later ones keep that date.
      ...(values.status === "published"
        ? {
            publishedAt: sql`coalesce(${sitePromotions.publishedAt}, ${at.toISOString()}::timestamptz)`,
          }
        : {}),
      updatedAt: at,
    })
    .where(
      and(
        eq(sitePromotions.id, id),
        eq(sitePromotions.workspaceId, workspaceId)
      )
    )
    .returning()
  if (!row) throw new Error("That deal no longer exists.")
  // Unpublishing has to reach visitors too, so every save clears.
  clearPublicDirectoryCache(workspaceId)
  return toPromotion(row)
}

/** One request for the whole selection; `done` names what was deleted. */
export async function deletePromotions(
  workspaceId: string,
  ids: string[],
  database: CustomShellDb = db
): Promise<{ done: string[]; kept: string[] }> {
  if (ids.length === 0) return { done: [], kept: [] }
  const deleted = await database
    .delete(sitePromotions)
    .where(
      and(
        eq(sitePromotions.workspaceId, workspaceId),
        inArray(sitePromotions.id, ids)
      )
    )
    .returning({ id: sitePromotions.id })
  const done = deleted.map((row) => row.id)
  if (done.length) clearPublicDirectoryCache(workspaceId)
  const doneSet = new Set(done)
  return { done, kept: ids.filter((id) => !doneSet.has(id)) }
}

/**
 * How many deals deleting these listings takes with it, for the listing
 * delete warning. The database deletes them with the listing.
 */
export async function dealImpactForListings(
  workspaceId: string,
  listingIds: string[],
  database: CustomShellDb = db
): Promise<{ deals: number }> {
  if (listingIds.length === 0) return { deals: 0 }
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(sitePromotions)
    .where(
      and(
        eq(sitePromotions.workspaceId, workspaceId),
        inArray(sitePromotions.listingId, listingIds)
      )
    )
  return { deals: row?.count ?? 0 }
}

/**
 * One of this site's listings' opening hours, for the deal window's "Same as
 * the listing's hours" button, or null when there is no such listing here.
 */
export async function listingHoursForDeal(
  workspaceId: string,
  listingId: string,
  database: CustomShellDb = db
): Promise<ListingHours | null> {
  const [row] = await database
    .select({ hours: directoryListings.hours })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.workspaceId, workspaceId),
        eq(directoryListings.id, listingId)
      )
    )
    .limit(1)
  return row ? cleanListingHours(row.hours) : null
}

/**
 * Undoes "End now": the deal is back on its own days and times. Only an admin
 * can, from the deal's window.
 */
export async function reopenPromotion(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<void> {
  const [row] = await database
    .update(sitePromotions)
    .set({ endedAt: null, updatedAt: now() })
    .where(
      and(
        eq(sitePromotions.id, id),
        eq(sitePromotions.workspaceId, workspaceId)
      )
    )
    .returning({ id: sitePromotions.id })
  if (!row) throw new Error("That deal no longer exists.")
  clearPublicDirectoryCache(workspaceId)
}
