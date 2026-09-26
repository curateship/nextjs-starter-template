import { and, eq, gte, inArray, like, sql } from "drizzle-orm"

import type { EventViewRange } from "@/lib/events/event-sort"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellTrafficDailyFacts } from "@/server/schema"
import { trafficDay } from "@/server/traffic"

const DAY_MS = 24 * 60 * 60 * 1000

/** Every event page sits under this, and that address is the traffic key. */
export const EVENT_PATH_PREFIX = "/events/"

/** The public address of an event page, the key its views are counted under. */
function eventViewPath(slug: string): string {
  return `${EVENT_PATH_PREFIX}${slug}`
}

function firstTrafficDay(days: number, at: Date): string {
  return trafficDay(new Date(at.getTime() - (days - 1) * DAY_MS))
}

/**
 * One site's path totals, grouped by address, as a table the events list can
 * join on. Aggregating once and joining beats a count per row: the list reads
 * fifty events at a time and every one of them would otherwise scan the same
 * facts.
 *
 * The join uses each event's current address, exactly as the listing counts
 * do. Views recorded before an event was renamed stay under its old address.
 */
export function eventViewTotals(
  workspaceId: string,
  days: EventViewRange,
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
        // Event pages only. Without this the totals also group every listing,
        // post and page the site has, which this join never looks at.
        like(facts.key, `${EVENT_PATH_PREFIX}%`),
        firstDay ? gte(facts.day, firstDay) : undefined
      )
    )
    .groupBy(facts.key)
    .as("event_views")
}

/** One event page's counts, in the last 30 days and over all time. */
export type EventViews = {
  /** Views in the 30 days ending today, the site's own days. */
  recent: number
  /** Every view ever recorded against this address. */
  all: number
}

/** The 30 days an owner's line reports. The line names the same number. */
const EVENT_RECENT_DAYS = 30

/** The map's key. A slug alone is not one: two sites can hold the same slug. */
export function eventViewsKey(workspaceId: string, slug: string): string {
  return `${workspaceId}\n${slug}`
}

/**
 * Both counts for a set of event pages, which may sit on several sites at
 * once. My listings needs that: one account can look after listings on more
 * than one site, and traffic is kept per site.
 *
 * Pages with no traffic at all are left out of the map, so the caller decides
 * whether that reads as 0 or as nothing yet.
 */
export async function eventViewsForPages(
  pages: { workspaceId: string; slug: string }[],
  database: CustomShellDb = db,
  at: Date = now()
): Promise<Map<string, EventViews>> {
  const wanted = new Map<string, Set<string>>()
  for (const page of pages) {
    if (!page.slug) continue
    const paths = wanted.get(page.workspaceId) ?? new Set<string>()
    paths.add(eventViewPath(page.slug))
    wanted.set(page.workspaceId, paths)
  }
  if (wanted.size === 0) return new Map()

  const facts = customShellTrafficDailyFacts
  const firstDay = firstTrafficDay(EVENT_RECENT_DAYS, at)
  const counts = new Map<string, EventViews>()

  // One query per site, because the key only means anything inside its own
  // site: two sites can hold the same event address.
  await Promise.all(
    [...wanted].map(async ([workspaceId, paths]) => {
      const rows = await database
        .select({
          key: facts.key,
          all: sql<number>`coalesce(sum(${facts.views}), 0)::int`.mapWith(
            Number
          ),
          recent:
            sql<number>`coalesce(sum(${facts.views}) filter (where ${facts.day} >= ${firstDay}::date), 0)::int`.mapWith(
              Number
            ),
        })
        .from(facts)
        .where(
          and(
            eq(facts.workspaceId, workspaceId),
            eq(facts.dimension, "path"),
            inArray(facts.key, [...paths])
          )
        )
        .groupBy(facts.key)
      for (const row of rows) {
        const slug = row.key.slice(EVENT_PATH_PREFIX.length)
        counts.set(eventViewsKey(workspaceId, slug), {
          recent: row.recent,
          all: row.all,
        })
      }
    })
  )

  return counts
}
