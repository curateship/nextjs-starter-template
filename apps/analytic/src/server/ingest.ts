import { sql, type AnyColumn } from "drizzle-orm"
import { z } from "zod"

import { db, type CustomShellDb } from "@/server/db"
import {
  analyticDailySiteStats,
  analyticEvents,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

export const MAX_EVENTS_PER_BATCH = 50
export const MAX_BODY_BYTES = 20_000
const MAX_PATH_LENGTH = 2048
const MAX_REFERRER_LENGTH = 2048
const DAY_MS = 86_400_000

// Only "pageview" today; the column is open for custom events later.
export const rawEventSchema = z.object({
  type: z.string().min(1).max(50),
  page_path: z.string().max(MAX_PATH_LENGTH).optional(),
  referrer: z.string().max(MAX_REFERRER_LENGTH).optional(),
  visitor_code: z.string().max(64).optional(),
  daily_visitor: z.boolean().optional(),
  timestamp: z.string().max(40).optional(),
})

export const batchSchema = z.object({
  events: z.array(rawEventSchema).max(MAX_EVENTS_PER_BATCH),
})

export type RawEvent = z.infer<typeof rawEventSchema>

// Audience dimensions derived once per request (the whole batch comes from
// one browser): device class + browser family from the user-agent header,
// country from the Cloudflare header. Country is null when unknown.
export type EventDimensions = {
  device: string
  browser: string
  country: string | null
}

// Rollup key for visitors whose country header is missing or unusable.
const UNKNOWN_COUNTRY = "Unknown"

function normalizeHost(host: string) {
  return host.split(":")[0]?.replace(/^www\./i, "").toLowerCase() || ""
}

// Keep only the pathname (drop query/hash and any host); cap length.
export function cleanPagePath(pagePath: string | undefined): string | null {
  if (typeof pagePath !== "string" || pagePath.length > MAX_PATH_LENGTH) {
    return null
  }
  try {
    const url = new URL(pagePath, "http://localhost")
    return url.pathname || "/"
  } catch {
    return null
  }
}

// Return the referrer's bare host, or null for same-site / invalid referrers.
export function extractReferrerDomain(
  url: string | undefined,
  siteDomain: string
): string | null {
  if (typeof url !== "string" || url.length > MAX_REFERRER_LENGTH) return null
  try {
    const domain = normalizeHost(new URL(url).hostname)
    if (!domain) return null
    if (siteDomain && domain === normalizeHost(siteDomain)) return null
    return domain
  } catch {
    return null
  }
}

// Trust the client timestamp only within +/-24h of server time; else use now.
export function resolveOccurredAt(
  timestamp: string | undefined,
  reference: Date = new Date()
): Date {
  if (typeof timestamp === "string") {
    const parsed = new Date(timestamp)
    if (
      Number.isFinite(parsed.getTime()) &&
      Math.abs(parsed.getTime() - reference.getTime()) <= DAY_MS
    ) {
      return parsed
    }
  }
  return reference
}

// UTC day, "YYYY-MM-DD". UTC is the one boundary rule used everywhere.
export function toUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

type DailyGroup = {
  pageViews: number
  visitors: number
  pages: Record<string, number>
  referrers: Record<string, number>
  devices: Record<string, number>
  browsers: Record<string, number>
  countries: Record<string, number>
}

type PreparedEvent = {
  type: string
  pagePath: string
  referrerDomain: string | null
  visitorCode: string | null
  occurredAt: Date
}

export type IngestResult = {
  stored: number
  rejected: number
}

// Pure step: validate + normalize a batch into insertable rows and day groups.
// Exposed for tests so the aggregation math can be checked without a database.
export function prepareBatch(
  events: RawEvent[],
  siteDomain: string,
  dimensions: EventDimensions,
  reference: Date = new Date()
): { prepared: PreparedEvent[]; groups: Map<string, DailyGroup>; rejected: number } {
  const prepared: PreparedEvent[] = []
  const groups = new Map<string, DailyGroup>()
  const countedVisitorDays = new Set<string>()
  let rejected = 0

  for (const event of events) {
    if (event.type !== "pageview") {
      rejected += 1
      continue
    }

    const pagePath = cleanPagePath(event.page_path)
    if (!pagePath) {
      rejected += 1
      continue
    }

    const occurredAt = resolveOccurredAt(event.timestamp, reference)
    const referrerDomain = extractReferrerDomain(event.referrer, siteDomain)
    const visitorCode =
      typeof event.visitor_code === "string" && event.visitor_code
        ? event.visitor_code.slice(0, 64)
        : null

    prepared.push({
      type: event.type,
      pagePath,
      referrerDomain,
      visitorCode,
      occurredAt,
    })

    const day = toUtcDay(occurredAt)
    const group = groups.get(day) ?? {
      pageViews: 0,
      visitors: 0,
      pages: {},
      referrers: {},
      devices: {},
      browsers: {},
      countries: {},
    }
    group.pageViews += 1
    group.pages[pagePath] = (group.pages[pagePath] ?? 0) + 1
    if (referrerDomain) {
      group.referrers[referrerDomain] =
        (group.referrers[referrerDomain] ?? 0) + 1
    }
    // At most one unique-visitor increment per request per day. Dimension
    // counters count visitors (not views) and the batch shares one browser,
    // so they increment here — each map's sum stays equal to visitors.
    if (event.daily_visitor === true && !countedVisitorDays.has(day)) {
      group.visitors += 1
      group.devices[dimensions.device] =
        (group.devices[dimensions.device] ?? 0) + 1
      group.browsers[dimensions.browser] =
        (group.browsers[dimensions.browser] ?? 0) + 1
      const country = dimensions.country ?? UNKNOWN_COUNTRY
      group.countries[country] = (group.countries[country] ?? 0) + 1
      countedVisitorDays.add(day)
    }
    groups.set(day, group)
  }

  return { prepared, groups, rejected }
}

// Merge an existing JSONB counter map with a new one, summing shared keys.
function mergeCounters(column: AnyColumn, next: Record<string, number>) {
  const json = JSON.stringify(next)
  return sql`COALESCE((
    SELECT jsonb_object_agg(key, to_jsonb(total::int))
    FROM (
      SELECT key, SUM(value::int) AS total
      FROM (
        SELECT key, value FROM jsonb_each_text(COALESCE(${column}, '{}'::jsonb))
        UNION ALL
        SELECT key, value FROM jsonb_each_text(${json}::jsonb)
      ) counts
      GROUP BY key
    ) merged
  ), '{}'::jsonb)`
}

// Store raw events and fold the batch into per-day totals. Assumes the site is
// already resolved and the batch already validated/size-capped by the caller.
export async function ingestBatch(
  siteId: string,
  siteDomain: string,
  events: RawEvent[],
  dimensions: EventDimensions,
  database: CustomShellDb = db,
  reference: Date = new Date()
): Promise<IngestResult> {
  const { prepared, groups, rejected } = prepareBatch(
    events,
    siteDomain,
    dimensions,
    reference
  )

  if (prepared.length === 0) {
    return { stored: 0, rejected }
  }

  const createdAt = now()

  await database.insert(analyticEvents).values(
    prepared.map((event) => ({
      id: uuid(),
      siteId,
      type: event.type,
      pagePath: event.pagePath,
      referrerDomain: event.referrerDomain,
      visitorCode: event.visitorCode,
      device: dimensions.device,
      browser: dimensions.browser,
      country: dimensions.country,
      occurredAt: event.occurredAt,
      createdAt,
    }))
  )

  for (const [day, group] of groups) {
    await database
      .insert(analyticDailySiteStats)
      .values({
        id: uuid(),
        siteId,
        day,
        pageViews: group.pageViews,
        visitors: group.visitors,
        pages: group.pages,
        referrers: group.referrers,
        devices: group.devices,
        browsers: group.browsers,
        countries: group.countries,
        createdAt,
        updatedAt: createdAt,
      })
      .onConflictDoUpdate({
        target: [analyticDailySiteStats.siteId, analyticDailySiteStats.day],
        set: {
          pageViews: sql`${analyticDailySiteStats.pageViews} + ${group.pageViews}`,
          visitors: sql`${analyticDailySiteStats.visitors} + ${group.visitors}`,
          pages: mergeCounters(analyticDailySiteStats.pages, group.pages),
          referrers: mergeCounters(
            analyticDailySiteStats.referrers,
            group.referrers
          ),
          devices: mergeCounters(
            analyticDailySiteStats.devices,
            group.devices
          ),
          browsers: mergeCounters(
            analyticDailySiteStats.browsers,
            group.browsers
          ),
          countries: mergeCounters(
            analyticDailySiteStats.countries,
            group.countries
          ),
          updatedAt: createdAt,
        },
      })
  }

  return { stored: prepared.length, rejected }
}
