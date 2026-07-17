import { and, asc, between, eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { analyticDailySiteStats, analyticSites } from "@/server/schema"

export type OverviewTotals = { pageViews: number; visitors: number }
export type OverviewPoint = { day: string; pageViews: number; visitors: number }
export type OverviewBreakdownItem = { key: string; count: number }

export type SiteOverview = {
  from: string
  to: string
  totals: OverviewTotals
  previous: OverviewTotals
  series: OverviewPoint[]
  topPages: OverviewBreakdownItem[]
  topReferrers: OverviewBreakdownItem[]
}

const BREAKDOWN_LIMIT = 8

// All day math is UTC to match the ingestion boundary.
function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`)
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(day: string, amount: number): string {
  const date = parseDay(day)
  date.setUTCDate(date.getUTCDate() + amount)
  return formatDay(date)
}

function daysInRange(from: string, to: string): number {
  const ms = parseDay(to).getTime() - parseDay(from).getTime()
  return Math.floor(ms / 86_400_000) + 1
}

function enumerateDays(from: string, to: string): string[] {
  const days: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day)
  }
  return days
}

function asCounterMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {}
  return value as Record<string, number>
}

function topFromCounter(
  totals: Map<string, number>
): OverviewBreakdownItem[] {
  return [...totals.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, BREAKDOWN_LIMIT)
}

// Returns headline totals (with the previous equal-length period for deltas),
// a zero-filled daily series, and top pages/referrers for the range.
export async function getSiteOverview(
  userId: string,
  siteId: string,
  from: string,
  to: string,
  database: CustomShellDb = db
): Promise<SiteOverview> {
  const [site] = await database
    .select({ id: analyticSites.id })
    .from(analyticSites)
    .where(and(eq(analyticSites.id, siteId), eq(analyticSites.userId, userId)))
    .limit(1)

  if (!site) throw new Error("Site not found")

  const windowLength = Math.max(1, daysInRange(from, to))
  const previousFrom = addDays(from, -windowLength)
  const previousTo = addDays(from, -1)

  // Pull the current and previous windows in one scan.
  const rows = await database
    .select()
    .from(analyticDailySiteStats)
    .where(
      and(
        eq(analyticDailySiteStats.siteId, siteId),
        between(analyticDailySiteStats.day, previousFrom, to)
      )
    )
    .orderBy(asc(analyticDailySiteStats.day))

  const byDay = new Map<string, (typeof rows)[number]>()
  const totals: OverviewTotals = { pageViews: 0, visitors: 0 }
  const previous: OverviewTotals = { pageViews: 0, visitors: 0 }
  const pageTotals = new Map<string, number>()
  const referrerTotals = new Map<string, number>()

  for (const row of rows) {
    const inCurrent = row.day >= from && row.day <= to
    const inPrevious = row.day >= previousFrom && row.day <= previousTo

    if (inCurrent) {
      byDay.set(row.day, row)
      totals.pageViews += row.pageViews
      totals.visitors += row.visitors
      for (const [key, count] of Object.entries(asCounterMap(row.pages))) {
        pageTotals.set(key, (pageTotals.get(key) ?? 0) + count)
      }
      for (const [key, count] of Object.entries(asCounterMap(row.referrers))) {
        referrerTotals.set(key, (referrerTotals.get(key) ?? 0) + count)
      }
    } else if (inPrevious) {
      previous.pageViews += row.pageViews
      previous.visitors += row.visitors
    }
  }

  const series: OverviewPoint[] = enumerateDays(from, to).map((day) => {
    const row = byDay.get(day)
    return {
      day,
      pageViews: row?.pageViews ?? 0,
      visitors: row?.visitors ?? 0,
    }
  })

  return {
    from,
    to,
    totals,
    previous,
    series,
    topPages: topFromCounter(pageTotals),
    topReferrers: topFromCounter(referrerTotals),
  }
}

// Range presets used by the dashboard. `to` is always "today" (UTC).
export type OverviewRange = "today" | "7d" | "30d" | "custom"

export function resolveRange(
  range: OverviewRange,
  today: string,
  custom?: { from?: string; to?: string }
): { from: string; to: string } {
  if (range === "custom" && custom?.from && custom?.to) {
    const from = custom.from <= custom.to ? custom.from : custom.to
    const to = custom.from <= custom.to ? custom.to : custom.from
    return { from, to }
  }
  if (range === "today") return { from: today, to: today }
  if (range === "30d") return { from: addDays(today, -29), to: today }
  return { from: addDays(today, -6), to: today }
}

export function utcToday(): string {
  return formatDay(new Date())
}
