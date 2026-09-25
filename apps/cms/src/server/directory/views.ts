import { and, asc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm"

import type { ListingViewRange } from "@/lib/directory/listing-sort"
import { db, type CustomShellDb } from "@/server/db"
import { directoryClaims, directoryListings } from "@/server/directory/schema"
import { customShellTrafficDailyFacts } from "@/server/schema"
import { now } from "@/server/auth/security"
import { trafficDay } from "@/server/traffic"

const DAY_MS = 24 * 60 * 60 * 1000

export type OwnerListingViewRange = 30 | 90

export type OwnerListingViewPoint = {
  day: string
  views: number
}

export type OwnerListingViews = {
  days: OwnerListingViewRange
  daily: OwnerListingViewPoint[]
  total: number
  previousTotal: number
  busiestDay: OwnerListingViewPoint | null
}

export function ownerListingViewRange(value: unknown): OwnerListingViewRange {
  return value === 90 ? 90 : 30
}

function dayAtOffset(today: string, offset: number): string {
  const date = new Date(`${today}T00:00:00.000Z`)
  return trafficDay(new Date(date.getTime() + offset * DAY_MS))
}

/**
 * Daily counts for one listing, after proving this account owns its approved
 * claim. Missing traffic days stay missing: a zero would claim the tracker
 * counted a day when it did not.
 */
export async function readOwnerListingViews(
  userId: string,
  listingId: string,
  requestedDays: unknown,
  database: CustomShellDb = db,
  at: Date = now()
): Promise<OwnerListingViews> {
  const days = ownerListingViewRange(requestedDays)
  const [owned] = await database
    .select({
      workspaceId: directoryListings.workspaceId,
      slug: directoryListings.slug,
    })
    .from(directoryClaims)
    .innerJoin(
      directoryListings,
      and(
        eq(directoryListings.id, directoryClaims.listingId),
        eq(directoryListings.workspaceId, directoryClaims.workspaceId)
      )
    )
    .where(
      and(
        eq(directoryClaims.userId, userId),
        eq(directoryClaims.listingId, listingId),
        eq(directoryClaims.status, "approved")
      )
    )
    .limit(1)

  if (!owned) throw new Error("You do not look after that listing.")

  const today = trafficDay(at)
  const currentFrom = dayAtOffset(today, -(days - 1))
  const previousFrom = dayAtOffset(today, -(days * 2 - 1))
  const afterToday = dayAtOffset(today, 1)
  const facts = customShellTrafficDailyFacts

  // The current slug is the honest boundary already used by the admin listing
  // counts. Views from before a rename remain under the old path.
  const rows = await database
    .select({ day: facts.day, views: facts.views })
    .from(facts)
    .where(
      and(
        eq(facts.workspaceId, owned.workspaceId),
        eq(facts.dimension, "path"),
        eq(facts.key, `/directory/${owned.slug}`),
        gte(facts.day, previousFrom),
        lt(facts.day, afterToday),
        gt(facts.views, 0)
      )
    )
    .orderBy(asc(facts.day))

  const currentRows = rows.filter((row) => row.day >= currentFrom)
  const previousTotal = rows
    .filter((row) => row.day < currentFrom)
    .reduce((sum, row) => sum + row.views, 0)
  const daily = currentRows.map((row) => ({
    day: row.day,
    views: row.views,
  }))
  const total = daily.reduce((sum, row) => sum + row.views, 0)
  const busiestDay = daily.reduce<OwnerListingViewPoint | null>(
    (busiest, row) => (!busiest || row.views > busiest.views ? row : busiest),
    null
  )

  return { days, daily, total, previousTotal, busiestDay }
}

function firstTrafficDay(days: Exclude<ListingViewRange, "all">, at: Date) {
  return trafficDay(new Date(at.getTime() - (days - 1) * DAY_MS))
}

/**
 * One listing's count over a date range. The join deliberately uses today's
 * slug: views recorded before a listing was renamed stay under its old path.
 * Redirect history can make that exact later; guessing today would overstate
 * the number.
 */
export function listingViewJoin(
  workspaceId: string,
  days: ListingViewRange,
  at: Date = now()
) {
  const firstDay = days === "all" ? null : firstTrafficDay(days, at)
  const facts = customShellTrafficDailyFacts

  return and(
    eq(facts.workspaceId, workspaceId),
    eq(facts.dimension, "path"),
    eq(facts.key, sql`'/directory/' || ${directoryListings.slug}`),
    firstDay ? gte(facts.day, firstDay) : undefined
  )
}

export function listingViewTotal() {
  return sql<number>`coalesce(sum(${customShellTrafficDailyFacts.views}), 0)::int`.mapWith(
    Number
  )
}

/** Counts only the listing ids on the requested page. Missing traffic is 0. */
export async function listingViewCounts(
  workspaceId: string,
  listingIds: string[],
  days: ListingViewRange,
  database: CustomShellDb = db,
  at: Date = now()
): Promise<Map<string, number>> {
  if (listingIds.length === 0) return new Map()

  const views = listingViewTotal()
  const rows = await database
    .select({ id: directoryListings.id, views })
    .from(directoryListings)
    .leftJoin(
      customShellTrafficDailyFacts,
      listingViewJoin(workspaceId, days, at)
    )
    .where(
      and(
        eq(directoryListings.workspaceId, workspaceId),
        inArray(directoryListings.id, listingIds)
      )
    )
    .groupBy(directoryListings.id)

  return new Map(rows.map((row) => [row.id, row.views]))
}
