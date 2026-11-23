import { and, between, eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import {
  asCounterMap,
  topFromCounter,
  type OverviewBreakdownItem,
} from "@/server/overview"
import { analyticDailySiteStats, analyticSites } from "@/server/schema"

export type SiteAudience = {
  from: string
  to: string
  devices: OverviewBreakdownItem[]
  browsers: OverviewBreakdownItem[]
  countries: OverviewBreakdownItem[]
}

// Devices have at most a handful of classes; browsers and countries are
// long-tailed, so countries get a little more room.
const BROWSER_LIMIT = 8
const COUNTRY_LIMIT = 12

// Sums the per-dimension visitor rollups for the range. Counts are unique
// visitors per day (a visitor active on three days counts three times),
// matching how the visitors headline number accumulates over a range.
export async function getSiteAudience(
  userId: string,
  siteId: string,
  from: string,
  to: string,
  database: CustomShellDb = db
): Promise<SiteAudience> {
  const [site] = await database
    .select({ id: analyticSites.id })
    .from(analyticSites)
    .where(and(eq(analyticSites.id, siteId), eq(analyticSites.userId, userId)))
    .limit(1)

  if (!site) throw new Error("Site not found")

  const rows = await database
    .select({
      devices: analyticDailySiteStats.devices,
      browsers: analyticDailySiteStats.browsers,
      countries: analyticDailySiteStats.countries,
    })
    .from(analyticDailySiteStats)
    .where(
      and(
        eq(analyticDailySiteStats.siteId, siteId),
        between(analyticDailySiteStats.day, from, to)
      )
    )

  const deviceTotals = new Map<string, number>()
  const browserTotals = new Map<string, number>()
  const countryTotals = new Map<string, number>()

  for (const row of rows) {
    for (const [key, count] of Object.entries(asCounterMap(row.devices))) {
      deviceTotals.set(key, (deviceTotals.get(key) ?? 0) + count)
    }
    for (const [key, count] of Object.entries(asCounterMap(row.browsers))) {
      browserTotals.set(key, (browserTotals.get(key) ?? 0) + count)
    }
    for (const [key, count] of Object.entries(asCounterMap(row.countries))) {
      countryTotals.set(key, (countryTotals.get(key) ?? 0) + count)
    }
  }

  return {
    from,
    to,
    devices: topFromCounter(deviceTotals, Number.MAX_SAFE_INTEGER),
    browsers: topFromCounter(browserTotals, BROWSER_LIMIT),
    countries: topFromCounter(countryTotals, COUNTRY_LIMIT),
  }
}
