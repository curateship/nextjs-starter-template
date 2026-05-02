import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

const DEFAULT_ROLLUP_DAYS = 2
const MAX_ROLLUP_DAYS = 366
const RAW_EVENT_RETENTION_DAYS = 90
const DEFAULT_PRUNE_BATCH_SIZE = 5000
const MAX_PRUNE_BATCH_SIZE = 50000

interface RollupOptions {
  days?: number
  prune?: boolean
  pruneBatchSize?: number
}

interface RollupRange {
  from: Date
  to: Date
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value!)))
}

function getUtcDayRange(days: number): RollupRange {
  const now = new Date()
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - days)
  return { from, to }
}

function getRetentionCutoff(): Date {
  const now = new Date()
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  cutoff.setUTCDate(cutoff.getUTCDate() - RAW_EVENT_RETENTION_DAYS)
  return cutoff
}

const normalizedAnalyticsEventsSql = (fromIso: string, toIso: string) => sql`
  WITH base AS (
    SELECT
      ae.site_id,
      (ae.created_at AT TIME ZONE 'UTC')::date AS day,
      ae.event_type,
      ae.page_path,
      ae.visitor_hash,
      NULLIF(ae.event_data ->> 'content_type', '') AS event_content_type,
      COALESCE(NULLIF(ae.event_data ->> 'content_id', ''), NULLIF(ae.event_data ->> 'product_id', '')) AS event_content_id,
      COALESCE(NULLIF(ae.event_data ->> 'content_slug', ''), NULLIF(ae.event_data ->> 'product_slug', '')) AS event_content_slug,
      split_part(trim(leading '/' from COALESCE(ae.page_path, '')), '/', 1) AS path_section,
      NULLIF(split_part(trim(leading '/' from COALESCE(ae.page_path, '')), '/', 2), '') AS path_slug
    FROM analytics_events ae
    WHERE ae.created_at >= ${fromIso}::timestamptz
      AND ae.created_at < ${toIso}::timestamptz
  ),
  typed AS (
    SELECT
      base.*,
      COALESCE(
        base.event_content_type,
        CASE base.path_section
          WHEN 'products' THEN 'product'
          WHEN 'posts' THEN 'post'
          WHEN 'events' THEN 'event'
          WHEN 'directories' THEN 'directory'
          WHEN 'categories' THEN 'category'
          WHEN 'pages' THEN 'page'
          ELSE 'path'
        END
      ) AS content_type,
      COALESCE(base.event_content_slug, base.path_slug) AS content_slug
    FROM base
  ),
  matched AS (
    SELECT
      typed.site_id,
      typed.day,
      typed.event_type,
      typed.page_path,
      typed.visitor_hash,
      typed.content_type,
      COALESCE(
        typed.event_content_id,
        CASE
          WHEN typed.content_type = 'product' THEN products.id::text
          WHEN typed.content_type = 'post' THEN posts.id::text
          WHEN typed.content_type = 'event' THEN events.id::text
          WHEN typed.content_type = 'directory' THEN directory.id::text
          WHEN typed.content_type = 'category' THEN categories.id::text
          WHEN typed.content_type = 'page' THEN pages.id::text
          ELSE NULL
        END
      ) AS content_id,
      typed.content_slug
    FROM typed
    LEFT JOIN products ON typed.site_id = products.site_id
      AND typed.content_type = 'product'
      AND typed.content_slug = products.slug
    LEFT JOIN posts ON typed.site_id = posts.site_id
      AND typed.content_type = 'post'
      AND typed.content_slug = posts.slug
    LEFT JOIN events ON typed.site_id = events.site_id
      AND typed.content_type = 'event'
      AND typed.content_slug = events.slug
    LEFT JOIN directory ON typed.site_id = directory.site_id
      AND typed.content_type = 'directory'
      AND typed.content_slug = directory.slug
    LEFT JOIN categories ON typed.site_id = categories.site_id
      AND typed.content_type = 'category'
      AND typed.content_slug = categories.slug
    LEFT JOIN pages ON typed.site_id = pages.site_id
      AND typed.content_type = 'page'
      AND typed.content_slug = pages.slug
  ),
  normalized AS (
    SELECT
      matched.site_id,
      matched.day,
      matched.event_type,
      matched.page_path,
      matched.visitor_hash,
      matched.content_type,
      matched.content_id,
      matched.content_slug,
      matched.content_type || ':' || COALESCE(matched.content_id, matched.content_slug, matched.page_path, 'unknown') AS content_key
    FROM matched
  )
`

export async function rollupAnalyticsEvents(options: RollupOptions = {}) {
  const days = clampInteger(options.days, DEFAULT_ROLLUP_DAYS, 1, MAX_ROLLUP_DAYS)
  const pruneBatchSize = clampInteger(
    options.pruneBatchSize,
    DEFAULT_PRUNE_BATCH_SIZE,
    1,
    MAX_PRUNE_BATCH_SIZE
  )
  const { from, to } = getUtcDayRange(days)
  const fromIso = from.toISOString()
  const toIso = to.toISOString()
  const shouldPrune = options.prune || process.env.ANALYTICS_PRUNE_RAW_EVENTS === 'true'

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      DELETE FROM analytics_daily_visitors
      WHERE day >= ${fromIso}::timestamptz::date
        AND day < ${toIso}::timestamptz::date
    `)

    await tx.execute(sql`
      DELETE FROM analytics_daily_events
      WHERE day >= ${fromIso}::timestamptz::date
        AND day < ${toIso}::timestamptz::date
    `)

    const eventInsert = await tx.execute(sql`
      ${normalizedAnalyticsEventsSql(fromIso, toIso)}
      INSERT INTO analytics_daily_events (
        site_id,
        day,
        content_key,
        content_type,
        content_id,
        content_slug,
        page_path,
        event_type,
        "count",
        updated_at
      )
      SELECT
        site_id,
        day,
        content_key,
        content_type,
        content_id,
        content_slug,
        MIN(page_path) AS page_path,
        event_type,
        COUNT(*)::int AS "count",
        now()
      FROM normalized
      GROUP BY site_id, day, content_key, content_type, content_id, content_slug, event_type
    `)

    const visitorInsert = await tx.execute(sql`
      ${normalizedAnalyticsEventsSql(fromIso, toIso)}
      INSERT INTO analytics_daily_visitors (
        site_id,
        day,
        content_key,
        content_type,
        content_id,
        content_slug,
        page_path,
        visitor_hash
      )
      SELECT
        site_id,
        day,
        content_key,
        content_type,
        content_id,
        content_slug,
        MIN(page_path) AS page_path,
        visitor_hash
      FROM normalized
      WHERE event_type = 'pageview'
        AND visitor_hash IS NOT NULL
      GROUP BY site_id, day, content_key, content_type, content_id, content_slug, visitor_hash
    `)

    let prunedEvents = 0
    if (shouldPrune) {
      const cutoff = getRetentionCutoff().toISOString()
      const pruneResult = await tx.execute(sql`
        WITH to_delete AS (
          SELECT ae.id
          FROM analytics_events ae
          WHERE ae.created_at < ${cutoff}::timestamptz
            AND EXISTS (
              SELECT 1
              FROM analytics_daily_events ade
              WHERE ade.site_id = ae.site_id
                AND ade.day = (ae.created_at AT TIME ZONE 'UTC')::date
            )
          ORDER BY ae.created_at
          LIMIT ${pruneBatchSize}
        )
        DELETE FROM analytics_events ae
        USING to_delete
        WHERE ae.id = to_delete.id
      `)
      prunedEvents = Number((pruneResult as { rowCount?: number }).rowCount ?? 0)
    }

    return {
      from: fromIso,
      to: toIso,
      days,
      eventRollups: Number((eventInsert as { rowCount?: number }).rowCount ?? 0),
      visitorRollups: Number((visitorInsert as { rowCount?: number }).rowCount ?? 0),
      prunedEvents,
      pruneEnabled: shouldPrune,
    }
  })
}
