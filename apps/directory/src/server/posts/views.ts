import { and, eq, gte, like, sql } from "drizzle-orm"

import type { ListingViewRange } from "@/lib/directory/listing-sort"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellTrafficDailyFacts } from "@/server/schema"
import { trafficDay } from "@/server/traffic"

const DAY_MS = 24 * 60 * 60 * 1000

/** Every post page sits under this, and that address is the traffic key. */
export const POST_PATH_PREFIX = "/posts/"

function firstTrafficDay(days: number, at: Date): string {
  return trafficDay(new Date(at.getTime() - (days - 1) * DAY_MS))
}

/**
 * One site's post-page totals, grouped by address, as a table the Posts
 * screen can join on. The same shape as the events one, for the same reason:
 * one sum per address beats a count per row when the list reads fifty posts
 * at a time.
 *
 * Only the daily rows the tracker wrote are summed. A day nobody opened the
 * post has no row, and nothing here makes one up, so a range with no visits
 * adds up to nothing rather than to a row of counted zeros.
 *
 * The join uses each post's current address, exactly as the listing and event
 * counts do. Views recorded before a post was renamed stay under its old
 * address.
 */
export function postViewTotals(
  workspaceId: string,
  days: ListingViewRange,
  database: CustomShellDb = db,
  at: Date = now()
) {
  const facts = customShellTrafficDailyFacts
  const firstDay = days === "all" ? null : firstTrafficDay(days, at)
  return database
    .select({
      key: facts.key,
      views: sql<number>`coalesce(sum(${facts.views}), 0)::int`
        .mapWith(Number)
        .as("views"),
    })
    .from(facts)
    .where(
      and(
        eq(facts.workspaceId, workspaceId),
        eq(facts.dimension, "path"),
        // Post pages only. The Posts page itself is "/posts", with no slash
        // after it, so its own visits are never added to a post's.
        like(facts.key, `${POST_PATH_PREFIX}%`),
        firstDay ? gte(facts.day, firstDay) : undefined
      )
    )
    .groupBy(facts.key)
    .as("post_views")
}
