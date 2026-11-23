import { inArray, lt, sql } from "drizzle-orm"

import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  promotionCountVisitors,
  promotionDailyCounts,
} from "@/server/promotions/schema"
import { trafficDay } from "@/server/traffic"

/**
 * How many people opened a deal's page, and how many tapped Show code.
 *
 * **Once per person per deal per day, for each.** The site's traffic counter
 * adds one for every page view, so a person reloading a deal five times is
 * five there. Here it is one view, and tapping Show code five times is one
 * tap. A person is the traffic counter's own daily hash (salt + internet
 * address + browser), so who is a bot, who is an admin and who is the same
 * person are decided the same way for both. The door in
 * `src/lib/api/promotions/public.ts` does those checks before calling this.
 *
 * Days are UTC days, the traffic counter's days, because the hash and its
 * salt change at UTC midnight.
 */

export type DealCountKind = "view" | "code"

export type DealCounts = {
  /** People who opened the deal's page, one a day each. */
  views: number
  /** People who tapped Show code, one a day each. */
  codeTaps: number
}

/** The last day this process swept on, so a busy day sweeps once, not per view. */
let lastSweptDay: string | null = null

export function resetDealCountSweepForTests() {
  lastSweptDay = null
}

/**
 * Deletes the hashes of finished days. Their counts are already in
 * `promotion_daily_counts`, so nothing a screen shows changes.
 */
export async function pruneDealCountVisitors(
  database: CustomShellDb = db,
  at: Date = now()
) {
  await database
    .delete(promotionCountVisitors)
    .where(lt(promotionCountVisitors.day, trafficDay(at)))
}

/**
 * Counts one view or one Show code tap, unless this person already has one
 * for this deal today. One statement: the hash row decides, and the day's
 * number only moves when the hash was new.
 */
export async function countDealVisit(
  input: { promotionId: string; kind: DealCountKind; visitorHash: string },
  database: CustomShellDb = db,
  at: Date = now()
): Promise<void> {
  const day = trafficDay(at)
  if (lastSweptDay !== day) {
    lastSweptDay = day
    await pruneDealCountVisitors(database, at)
  }

  const isView = input.kind === "view" ? 1 : 0
  await database.execute(sql`
    with new_visitor as (
      insert into promotion_count_visitors (promotion_id, day, kind, visitor_hash)
      values (${input.promotionId}, ${day}, ${input.kind}, ${input.visitorHash})
      on conflict do nothing
      returning 1
    )
    insert into promotion_daily_counts (promotion_id, day, views, code_taps)
    select ${input.promotionId}, ${day}, ${isView}::int, ${1 - isView}::int
    from new_visitor
    on conflict (promotion_id, day) do update set
      views = promotion_daily_counts.views + excluded.views,
      code_taps = promotion_daily_counts.code_taps + excluded.code_taps
  `)
}

/**
 * Every day added up, for the deals asked about. A deal nobody has opened is
 * missing from the map, and the caller reads that as 0.
 */
export async function dealCountsFor(
  promotionIds: string[],
  database: CustomShellDb = db
): Promise<Map<string, DealCounts>> {
  if (promotionIds.length === 0) return new Map()
  const rows = await database
    .select({
      promotionId: promotionDailyCounts.promotionId,
      views: sql<number>`coalesce(sum(${promotionDailyCounts.views}), 0)::int`.mapWith(
        Number
      ),
      codeTaps:
        sql<number>`coalesce(sum(${promotionDailyCounts.codeTaps}), 0)::int`.mapWith(
          Number
        ),
    })
    .from(promotionDailyCounts)
    .where(inArray(promotionDailyCounts.promotionId, promotionIds))
    .groupBy(promotionDailyCounts.promotionId)
  return new Map(
    rows.map((row) => [
      row.promotionId,
      { views: row.views, codeTaps: row.codeTaps },
    ])
  )
}

/**
 * The tap number a screen shows. No code, or a code per visitor, means no Show
 * code button, so no tap number unless some were counted before the code went.
 */
export function shownCodeTaps(
  deal: { code: string; takesClaims: boolean },
  codeTaps: number
): number | null {
  const hasButton = Boolean(deal.code) && !deal.takesClaims
  return hasButton || codeTaps > 0 ? codeTaps : null
}
