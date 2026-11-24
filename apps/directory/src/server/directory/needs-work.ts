import { sql, type SQL } from "drizzle-orm"

import { NEEDS_WORK_GAPS, type NeedsWorkGap } from "@/lib/directory/needs-work"
import { db, type CustomShellDb } from "@/server/db"

/**
 * The Needs work row of the Listings dashboard (Tyler's pick, 24 Nov 2026):
 * published listings missing a photo, opening hours, a write-up or a
 * category. `lib/directory/needs-work.ts` names the four. A draft is still
 * being written and a closed listing has no page to improve, so neither is
 * in it.
 */

/** Each gap as SQL about `listing`, true when the listing is missing it. */
const GAP_SQL: Record<NeedsWorkGap, SQL> = {
  photo: sql`btrim(listing.featured_image) = ''`,
  hours: sql`NOT EXISTS (
    SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(listing.hours) = 'object' THEN listing.hours ELSE '{}'::jsonb END) AS day
    WHERE jsonb_typeof(day.value) = 'object'
      AND coalesce(day.value->>'open', '') <> ''
      AND coalesce(day.value->>'close', '') <> ''
  )`,
  // The editor only writes a text node that holds letters.
  writeUp: sql`NOT jsonb_path_exists(listing.body, '$.** ? (@.type == "text")')`,
  category: sql`NOT EXISTS (
    SELECT 1 FROM category_relationships link
    WHERE link.workspace_id = listing.workspace_id
      AND link.content_type = 'directory_listing'
      AND link.content_id = listing.id
  )`,
}

const GAP_COLUMNS = sql.join(
  NEEDS_WORK_GAPS.map((gap) => sql`(${GAP_SQL[gap]}) AS ${sql.identifier(gap)}`),
  sql`, `
)

const ANY_GAP = sql.raw(NEEDS_WORK_GAPS.map((gap) => `gaps."${gap}"`).join(" OR "))

/** One listing on the row, with what it is missing. */
export type NeedsWorkListing = {
  id: string
  title: string
  slug: string
  featuredImage: string
  gaps: NeedsWorkGap[]
}

export type NeedsWorkPage = {
  listings: NeedsWorkListing[]
  total: number
  page: number
  pageSize: number
}

type Row = { id: string; title: string; slug: string; featuredImage: string; total: number } & Record<NeedsWorkGap, boolean>

function narrowed(workspaceId: string, options: { search?: string; gap?: NeedsWorkGap }) {
  const words = options.search?.trim()
  return sql`
    WITH gaps AS (
      SELECT listing.id, listing.title, listing.slug, listing.featured_image AS "featuredImage", ${GAP_COLUMNS}
      FROM directory_listings listing
      WHERE listing.workspace_id = ${workspaceId} AND listing.status = 'published'
    )
    SELECT gaps.*, count(*) OVER ()::int AS total
    FROM gaps
    WHERE (${ANY_GAP})
      ${options.gap ? sql`AND gaps.${sql.identifier(options.gap)}` : sql``}
      ${words ? sql`AND gaps.title ILIKE ${`%${words}%`}` : sql``}
  `
}

/** One page of the listings that need work, A to Z, narrowed to the words typed and one gap. */
export async function listNeedsWork(
  workspaceId: string,
  options: { search?: string; gap?: NeedsWorkGap; page?: number; limit?: number },
  database: CustomShellDb = db
): Promise<NeedsWorkPage> {
  const pageSize = Math.min(Math.max(options.limit ?? 25, 1), 100)
  const page = Math.max(1, options.page ?? 1)
  const result = await database.execute(sql`
    ${narrowed(workspaceId, options)}
    ORDER BY gaps.title, gaps.id
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `)
  const rows = result.rows as Row[]
  return {
    listings: rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      featuredImage: row.featuredImage,
      gaps: NEEDS_WORK_GAPS.filter((gap) => row[gap]),
    })),
    total: rows[0]?.total ?? (page > 1 ? (await needsWorkCount(workspaceId, database, options)) : 0),
    page,
    pageSize,
  }
}

/** How many published listings miss at least one thing, for the row's pill. */
export async function needsWorkCount(
  workspaceId: string,
  database: CustomShellDb = db,
  options: { search?: string; gap?: NeedsWorkGap } = {}
): Promise<number> {
  const result = await database.execute(sql`SELECT count(*)::int AS total FROM (${narrowed(workspaceId, options)}) AS shown`)
  return Number((result.rows[0] as { total: number } | undefined)?.total ?? 0)
}
