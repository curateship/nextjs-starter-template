import { and, eq, gte, inArray, sql } from "drizzle-orm"

import type { ListingViewRange } from "@/lib/directory/listing-sort"
import { db, type CustomShellDb } from "@/server/db"
import { directoryListings } from "@/server/directory/schema"
import { customShellTrafficDailyFacts } from "@/server/schema"
import { now } from "@/server/auth/security"
import { trafficDay } from "@/server/traffic"

const DAY_MS = 24 * 60 * 60 * 1000

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
