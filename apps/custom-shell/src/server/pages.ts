import { and, eq, gte, sql } from "drizzle-orm"

import type { PageDescriptor } from "@/lib/pages/page-descriptor"
import { publicPages } from "@/lib/pages/page-registry"
import { db, type CustomShellDb } from "@/server/db"
import { customShellTrafficDailyFacts } from "@/server/schema"
import { now } from "@/server/security"
import { OTHER_KEY, trafficDay } from "@/server/traffic"

/**
 * The Pages dashboard's one read: the page registry joined to the visit
 * counts the traffic tracker already keeps. Nothing new is recorded here —
 * the beacon writes per-address counters (`recordVisit`), and this sums them
 * for exactly the addresses the registry declares.
 */

/**
 * The one window the Visits column counts. Fixed rather than pickable — the
 * screen is "does anybody read this page", and one steady month answers it;
 * the Traffic page is where ranges are compared.
 */
export const PAGES_VISIT_DAYS = 30

export type PublicPageRow = PageDescriptor & {
  /** Views of this address over the last `PAGES_VISIT_DAYS` days. */
  visits: number
}

export type PagesOverview = {
  /**
   * How many days the visit counts cover. Carried rather than assumed, so the
   * column heading says the window the numbers were actually summed over —
   * one number, written once, in `PAGES_VISIT_DAYS`.
   */
  visitDays: number
  /** One row per registered page, in the registry's address order. */
  rows: PublicPageRow[]
  /**
   * True when some day in the window hit the per-day address cap
   * (`FACT_KEY_CAPS.path`) and spilled the rest into the overflow bucket. A
   * page showing few visits may then have had more — the screen says so
   * rather than pretending the numbers are exact.
   */
  approximate: boolean
}

export async function loadPagesOverview(
  database: CustomShellDb = db,
  at: Date = now()
): Promise<PagesOverview> {
  const firstDay = trafficDay(
    new Date(at.getTime() - (PAGES_VISIT_DAYS - 1) * 24 * 60 * 60 * 1000)
  )
  const facts = customShellTrafficDailyFacts

  const factRows = await database
    .select({
      key: facts.key,
      views: sql<string>`sum(${facts.views})`,
    })
    .from(facts)
    .where(and(eq(facts.dimension, "path"), gte(facts.day, firstDay)))
    .groupBy(facts.key)

  const visitsByPath = new Map(
    factRows.map((row) => [row.key, Number(row.views)])
  )

  return {
    visitDays: PAGES_VISIT_DAYS,
    // Registry first, counts second: a page nobody has visited still gets its
    // row, and an address the tracker counted but nobody declared stays off
    // the list — this screen is about the pages, not the traffic.
    rows: publicPages().map((page) => ({
      ...page,
      visits: visitsByPath.get(page.path) ?? 0,
    })),
    approximate: visitsByPath.has(OTHER_KEY),
  }
}
