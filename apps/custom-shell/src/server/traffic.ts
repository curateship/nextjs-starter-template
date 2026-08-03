import { and, asc, gte, lt, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import {
  customShellRateLimits,
  customShellTrafficDailyFacts,
  customShellTrafficDailyTotals,
  customShellTrafficDaySalts,
  customShellTrafficVisitors,
  customShellTrafficVisits,
} from "@/server/schema"
import { createSecretToken, hashToken, now, uuid } from "@/server/security"

/**
 * The traffic tracker's engine room. The beacon route
 * (src/routes/api/v1/traffic/view.ts) filters and hashes, then calls
 * `recordVisit`; the admin dashboard reads through `loadTrafficSummary`.
 *
 * Permanent data is only the per-day counter rows. Everything identifying is
 * scaffolding with a short life: visit rows go after `VISIT_LOG_DAYS`, and
 * the visitor-hash and salt rows go as soon as their day has passed — each
 * day's unique count is frozen into the totals row as it happens, so
 * deleting them changes nothing.
 */

export const VISIT_LOG_DAYS = 7

/** How many distinct keys one day may hold before overflow becomes '(other)'. */
export const FACT_KEY_CAPS = {
  path: 200,
  referrer: 100,
  device: 10,
} as const

export const OTHER_KEY = "(other)"

export type TrafficDevice = "phone" | "tablet" | "computer"
export type TrafficAudience = "member" | "visitor"

// ---------------------------------------------------------------------------
// The pure filters and normalizers the beacon route runs a request through.

const BOT_UA_PATTERN =
  /bot|crawl|spider|slurp|headless|lighthouse|prerender|preview|scraper|curl|wget|python|monitor|pingdom|facebookexternalhit/i

/** No user agent at all is a script, not a browser. */
export function isBotUserAgent(userAgent: string | null | undefined) {
  return !userAgent || BOT_UA_PATTERN.test(userAgent)
}

/** The `sec-purpose` / `purpose` headers a prefetching browser sends. */
export function isPrefetchPurpose(purpose: string | null | undefined) {
  return Boolean(purpose && /prefetch|prerender|preview/i.test(purpose))
}

export function classifyDevice(userAgent: string): TrafficDevice {
  // Android tablets say Android without Mobile; iPads say iPad (desktop-mode
  // iPads claim to be computers and are counted as such — accepted).
  if (/ipad/i.test(userAgent)) return "tablet"
  if (/android(?!.*mobile)/i.test(userAgent)) return "tablet"
  if (/mobi|iphone/i.test(userAgent)) return "phone"
  return "computer"
}

/**
 * The page a view counts against: path only, query and hash stripped, capped
 * at the column width. Null means "don't count this at all" — junk, API
 * calls, and the admin area (the caller drops admin paths via `isAdminHref`;
 * this refuses the plainly-not-a-page ones).
 */
export function normalizeTrafficPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null
  const path = raw.split(/[?#]/, 1)[0]
  if (!path || path.startsWith("/api/") || path === "/api") return null
  return path.slice(0, 160)
}

/**
 * Where a visit came from, as a bare site name — "google.com", never a full
 * URL. Empty, unparseable, or same-site referrers are all 'direct'.
 */
export function normalizeReferrer(
  raw: unknown,
  ownHost: string | null
): string {
  if (typeof raw !== "string" || !raw.trim()) return "direct"
  let host: string
  try {
    host = new URL(raw).hostname
  } catch {
    return "direct"
  }
  if (!host || (ownHost && host === ownHost)) return "direct"
  return host.slice(0, 100)
}

/** The UTC calendar day a moment falls on, as YYYY-MM-DD. */
export function trafficDay(at: Date): string {
  return at.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// The daily salt, and the once-a-day sweep.

/**
 * Each database's salt for the current day, held in memory so a day's worth
 * of views costs one salt read. Keyed by database so tests with their own
 * PGlite never see another database's salt.
 */
const saltCache = new WeakMap<object, { day: string; salt: string }>()

export async function getDaySalt(
  day: string,
  database: CustomShellDb = db
): Promise<string> {
  const cached = saltCache.get(database)
  if (cached && cached.day === day) return cached.salt

  // Upsert-returning so two racing first-views of a day agree on one salt:
  // the no-op update makes RETURNING hand back whichever row won.
  const [row] = await database
    .insert(customShellTrafficDaySalts)
    .values({ day, salt: createSecretToken() })
    .onConflictDoUpdate({
      target: customShellTrafficDaySalts.day,
      set: { day },
    })
    .returning({ salt: customShellTrafficDaySalts.salt })

  if (!row) throw new Error("Traffic salt was not created")
  saltCache.set(database, { day, salt: row.salt })
  return row.salt
}

/** sha256(daily salt + ip + user agent) — the only form a visitor is stored in. */
export function hashVisitor(salt: string, ip: string, userAgent: string) {
  return hashToken(`${salt}${ip}${userAgent}`)
}

/**
 * Deletes what has outlived its use: visit rows past the log window, and the
 * hash and salt rows of finished days (their counts are already frozen in
 * the totals). Also clears the tracker's spent rate-limit rows: the app-wide
 * cleanup in `server/cleanup.ts` clears those too and sooner, but it rides in
 * on an admin's first page of the day, and a site nobody administers still
 * gets its page views counted.
 *
 * There is no scheduler in this app, so this runs opportunistically — on the
 * first counted view of each UTC day per process, and when the dashboard is
 * opened — the same pattern as `purgeExpiredDeletions`.
 */
export async function pruneTrafficData(
  database: CustomShellDb = db,
  at: Date = now()
) {
  const today = trafficDay(at)
  const logCutoff = new Date(at.getTime() - VISIT_LOG_DAYS * 24 * 60 * 60 * 1000)

  await database
    .delete(customShellTrafficVisits)
    .where(lt(customShellTrafficVisits.occurredAt, logCutoff))
  await database
    .delete(customShellTrafficVisitors)
    .where(lt(customShellTrafficVisitors.day, today))
  await database
    .delete(customShellTrafficDaySalts)
    .where(lt(customShellTrafficDaySalts.day, today))
  await database
    .delete(customShellRateLimits)
    .where(
      and(
        sql`${customShellRateLimits.key} like 'traffic:%'`,
        lt(customShellRateLimits.updatedAt, logCutoff)
      )
    )
}

/** The last day this process swept on, so a busy day sweeps once, not per view. */
let lastSweptDay: string | null = null

export function resetTrafficSweepForTests() {
  lastSweptDay = null
}

// ---------------------------------------------------------------------------
// The write path.

export type VisitInput = {
  path: string
  referrerDomain: string
  device: TrafficDevice
  audience: TrafficAudience
  visitorHash: string
}

/**
 * Counts one page view: the visit log row, the day's totals (unique visitors
 * frozen in as they first appear), and the three per-dimension fact rows —
 * in two statements, so a view under load is two round trips, not seven.
 */
export async function recordVisit(
  input: VisitInput,
  database: CustomShellDb = db,
  at: Date = now()
) {
  const day = trafficDay(at)

  if (lastSweptDay !== day) {
    lastSweptDay = day
    await pruneTrafficData(database, at)
  }

  const isMember = input.audience === "member" ? 1 : 0

  // One CTE: dedup the visitor, log the visit, and upsert the totals with
  // the unique count incremented only when the hash was new. Data-modifying
  // CTEs always run, so the visit row is written even though nothing selects
  // from it.
  await database.execute(sql`
    with new_visitor as (
      insert into traffic_visitors (day, visitor_hash)
      values (${day}, ${input.visitorHash})
      on conflict do nothing
      returning 1
    ),
    visit as (
      insert into traffic_visits (id, occurred_at, path, referrer_domain, device, audience)
      values (${uuid()}, ${at}, ${input.path}, ${input.referrerDomain}, ${input.device}, ${input.audience})
    )
    insert into traffic_daily_totals (day, views, member_views, visitor_views, unique_visitors)
    values (${day}, 1, ${isMember}, ${1 - isMember}, (select count(*) from new_visitor))
    on conflict (day) do update set
      views = traffic_daily_totals.views + 1,
      member_views = traffic_daily_totals.member_views + ${isMember},
      visitor_views = traffic_daily_totals.visitor_views + ${1 - isMember},
      unique_visitors = traffic_daily_totals.unique_visitors + (select count(*) from new_visitor)
  `)

  // The three fact rows, with the cardinality cap inline: a key the day has
  // already seen keeps incrementing itself, a new key past the cap lands in
  // '(other)'. The cap is soft under racing requests — two new keys can
  // squeak in at once — which costs a couple of extra rows, nothing more.
  await database.execute(sql`
    with candidate (dimension, key, cap) as (
      values
        ('path', ${input.path}, ${FACT_KEY_CAPS.path}::int),
        ('referrer', ${input.referrerDomain}, ${FACT_KEY_CAPS.referrer}::int),
        ('device', ${input.device}, ${FACT_KEY_CAPS.device}::int)
    ),
    capped as (
      select
        candidate.dimension,
        case
          when exists (
            select 1 from traffic_daily_facts existing
            where existing.day = ${day}
              and existing.dimension = candidate.dimension
              and existing.key = candidate.key
          ) then candidate.key
          when (
            select count(*) from traffic_daily_facts existing
            where existing.day = ${day}
              and existing.dimension = candidate.dimension
          ) >= candidate.cap then ${OTHER_KEY}
          else candidate.key
        end as key
      from candidate
    )
    insert into traffic_daily_facts (day, dimension, key, views)
    select ${day}, dimension, key, 1 from capped
    on conflict (day, dimension, key) do update set
      views = traffic_daily_facts.views + 1
  `)
}

// ---------------------------------------------------------------------------
// The read path.

export type TrafficRangeDays = 7 | 30 | 90

export type TrafficDayPoint = {
  day: string
  memberViews: number
  visitorViews: number
}

export type TrafficKeyCount = { key: string; views: number }

export type TrafficSummary = {
  days: TrafficRangeDays
  totals: {
    views: number
    memberViews: number
    visitorViews: number
    /** The sum of each day's count — the same person on two days counts twice. */
    uniqueVisitors: number
  }
  viewsToday: number
  daily: TrafficDayPoint[]
  topPages: TrafficKeyCount[]
  topReferrers: TrafficKeyCount[]
  devices: TrafficKeyCount[]
}

const TOP_ROWS = 15

export async function loadTrafficSummary(
  days: TrafficRangeDays,
  database: CustomShellDb = db,
  at: Date = now()
): Promise<TrafficSummary> {
  await pruneTrafficData(database, at)

  const today = trafficDay(at)
  const firstDay = trafficDay(
    new Date(at.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  )

  const totals = customShellTrafficDailyTotals
  const facts = customShellTrafficDailyFacts

  const totalRows = await database
    .select()
    .from(totals)
    .where(gte(totals.day, firstDay))
    .orderBy(asc(totals.day))

  const factRows = await database
    .select({
      dimension: facts.dimension,
      key: facts.key,
      views: sql<string>`sum(${facts.views})`,
    })
    .from(facts)
    .where(gte(facts.day, firstDay))
    .groupBy(facts.dimension, facts.key)

  // Every day in the range appears in the chart, traffic or none — a gap
  // reads as missing data, not as a quiet day.
  const byDay = new Map(totalRows.map((row) => [row.day, row]))
  const daily: TrafficDayPoint[] = []
  for (
    let day = new Date(`${firstDay}T00:00:00Z`);
    trafficDay(day) <= today;
    day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
  ) {
    const row = byDay.get(trafficDay(day))
    daily.push({
      day: trafficDay(day),
      memberViews: row?.memberViews ?? 0,
      visitorViews: row?.visitorViews ?? 0,
    })
  }

  const topOf = (dimension: string) => {
    const rows = factRows
      .filter((row) => row.dimension === dimension)
      .map((row) => ({ key: row.key, views: Number(row.views) }))
      .sort((a, b) => b.views - a.views || a.key.localeCompare(b.key))
      .slice(0, TOP_ROWS)
    // The overflow bucket reads as a footnote, not a contender for the top.
    const other = rows.findIndex((row) => row.key === OTHER_KEY)
    if (other >= 0) rows.push(...rows.splice(other, 1))
    return rows
  }

  return {
    days,
    totals: {
      views: totalRows.reduce((sum, row) => sum + row.views, 0),
      memberViews: totalRows.reduce((sum, row) => sum + row.memberViews, 0),
      visitorViews: totalRows.reduce((sum, row) => sum + row.visitorViews, 0),
      uniqueVisitors: totalRows.reduce(
        (sum, row) => sum + row.uniqueVisitors,
        0
      ),
    },
    viewsToday: byDay.get(today)?.views ?? 0,
    daily,
    topPages: topOf("path"),
    topReferrers: topOf("referrer"),
    devices: topOf("device"),
  }
}
