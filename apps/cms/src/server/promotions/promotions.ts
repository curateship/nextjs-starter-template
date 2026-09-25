import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm"

import { isValidDateString } from "@/lib/events/calendar-grid"
import { slugFromTitle, slugProblem } from "@/lib/directory/slugs"
import { siteToday, type DealDays } from "@/lib/promotions/deal-days"
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

export const MAX_PROMOTION_TITLE = 200
export const MAX_PROMOTION_DESCRIPTION = 2000
export const MAX_PROMOTION_CODE = 40
export const MAX_PROMOTION_SMALL_PRINT = 1000

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
  status: PromotionStatus
  publishedAt: Date | null
  createdByUserId: string | null
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
    status: row.status === "published" ? "published" : "draft",
    publishedAt: row.publishedAt,
    createdByUserId: row.createdByUserId,
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

/**
 * The columns every save writes, checked. The listing must be one of this
 * site's, so a deal can never point at another site's place.
 */
async function cleanValues(
  workspaceId: string,
  input: PromotionInput,
  database: CustomShellDb
) {
  // Checked in the order the window shows them, title first.
  const title = cleanTitle(input.title)
  if (!input.listingId) throw new Error("Pick the listing the deal is at.")
  const listing = await listingChoice(workspaceId, input.listingId, database)
  if (!listing) throw new Error("That listing is not on this site any more.")
  return {
    title,
    listingId: listing.id,
    description: input.description
      .trim()
      .slice(0, MAX_PROMOTION_DESCRIPTION),
    coverImage: input.coverImage.trim().slice(0, 600),
    code: input.code.trim().slice(0, MAX_PROMOTION_CODE),
    smallPrint: input.smallPrint.trim().slice(0, MAX_PROMOTION_SMALL_PRINT),
    ...cleanDealHeadline(input),
    status: input.status,
    ...cleanDealDays(input),
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
): Promise<{ promotions: PromotionSummary[]; total: number; today: string }> {
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
    today: siteToday(timeZone, new Date()),
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
