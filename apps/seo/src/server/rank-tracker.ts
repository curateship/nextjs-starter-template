import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { getOwnedProject } from "@/server/seo-projects"
import {
  keywordRankings,
  keywords,
  projectKeywords,
} from "@/server/schema"

export type SerpOrganicItem = {
  type?: string
  rank_absolute?: number | null
  domain?: string | null
  url?: string | null
  title?: string | null
}

export type SerpMatch = {
  position: number | null
  url: string | null
  title: string | null
  topResults: Array<{
    position: number | null
    domain: string | null
    url: string | null
    title: string | null
  }>
}

/**
 * Finds the project domain's best organic position in a SERP items array.
 * Matches the domain and its subdomains; ignores non-organic items.
 */
export function matchSerpPosition(
  items: SerpOrganicItem[],
  normalizedDomain: string
): SerpMatch {
  const organic = items.filter(
    (item) => item.type === "organic" && item.rank_absolute != null
  )
  const match = organic.find((item) => {
    const domain = (item.domain ?? "").toLowerCase().replace(/^www\./, "")
    return (
      domain === normalizedDomain || domain.endsWith(`.${normalizedDomain}`)
    )
  })

  return {
    position: match?.rank_absolute ?? null,
    url: match?.url ?? null,
    title: match?.title ?? null,
    topResults: organic.slice(0, 3).map((item) => ({
      position: item.rank_absolute ?? null,
      domain: item.domain ?? null,
      url: item.url ?? null,
      title: item.title ?? null,
    })),
  }
}

export async function setKeywordTracking(
  userId: string,
  projectId: string,
  projectKeywordIds: string[],
  tracked: boolean,
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)
  if (!projectKeywordIds.length) return { updated: 0 }

  const updated = await database
    .update(projectKeywords)
    .set({ trackedAt: tracked ? new Date() : null, updatedAt: new Date() })
    .where(
      and(
        eq(projectKeywords.projectId, projectId),
        inArray(projectKeywords.id, projectKeywordIds)
      )
    )
    .returning({ id: projectKeywords.id })

  return { updated: updated.length }
}

export async function listTrackedKeywords(
  projectId: string,
  limit: number,
  database: CustomShellDb = db
) {
  return database
    .select({
      projectKeywordId: projectKeywords.id,
      keywordId: keywords.id,
      keyword: keywords.keyword,
    })
    .from(projectKeywords)
    .innerJoin(keywords, eq(projectKeywords.keywordId, keywords.id))
    .where(
      and(
        eq(projectKeywords.projectId, projectId),
        sql`${projectKeywords.trackedAt} is not null`
      )
    )
    .orderBy(asc(projectKeywords.trackedAt))
    .limit(limit)
}

export type RankingSortField =
  | "keyword"
  | "position"
  | "change"
  | "lastChecked"

export type RankingRow = {
  projectKeywordId: string
  keywordId: string
  keyword: string
  position: number | null
  previousPosition: number | null
  change: number | null
  bestPosition: number | null
  rankingUrl: string | null
  lastCheckedAt: string | null
}

export async function listRankingsForProject(
  userId: string,
  input: {
    projectId: string
    q?: string
    sort?: { field: RankingSortField; direction: "asc" | "desc" }
    pagination: { page: number; pageSize: number }
  },
  database: CustomShellDb = db
): Promise<{ rows: RankingRow[]; total: number }> {
  await getOwnedProject(userId, input.projectId, database)

  const conditions = [
    eq(projectKeywords.projectId, input.projectId),
    sql`${projectKeywords.trackedAt} is not null`,
  ]
  if (input.q?.trim()) {
    conditions.push(sql`${keywords.keyword} ilike ${`%${input.q.trim()}%`}`)
  }

  // Latest and previous check per keyword, plus best-ever position. Every
  // correlated subquery scopes to this project + the joined keyword.
  const scoped = sql`r.project_id = ${input.projectId} and r.keyword_id = ${keywords.id}`
  const latest = sql`(select r.position from ${keywordRankings} r where ${scoped} order by r.checked_at desc limit 1)`
  const previous = sql`(select r.position from ${keywordRankings} r where ${scoped} order by r.checked_at desc limit 1 offset 1)`
  const best = sql`(select min(r.position) from ${keywordRankings} r where ${scoped})`
  const latestUrl = sql`(select r.ranking_url from ${keywordRankings} r where ${scoped} order by r.checked_at desc limit 1)`
  const lastChecked = sql`(select r.checked_at from ${keywordRankings} r where ${scoped} order by r.checked_at desc limit 1)`
  // Positive change = improvement (moved up the SERP).
  const change = sql`(${previous}) - (${latest})`

  const sort = input.sort ?? { field: "position", direction: "asc" }
  const sortColumn = {
    keyword: sql`${keywords.keyword}`,
    position: latest,
    change,
    lastChecked,
  }[sort.field]
  const orderBy =
    sort.direction === "asc"
      ? sql`${sortColumn} asc nulls last`
      : sql`${sortColumn} desc nulls last`

  const page = Math.max(1, input.pagination.page)
  const pageSize = Math.max(1, Math.min(input.pagination.pageSize, 100))

  const [totalRow] = await database
    .select({ value: count() })
    .from(projectKeywords)
    .innerJoin(keywords, eq(projectKeywords.keywordId, keywords.id))
    .where(and(...conditions))

  const rows = await database
    .select({
      projectKeywordId: projectKeywords.id,
      keywordId: keywords.id,
      keyword: keywords.keyword,
      position: sql<number | null>`${latest}`,
      previousPosition: sql<number | null>`${previous}`,
      bestPosition: sql<number | null>`${best}`,
      rankingUrl: sql<string | null>`${latestUrl}`,
      lastCheckedAt: sql<string | null>`${lastChecked}`,
    })
    .from(projectKeywords)
    .innerJoin(keywords, eq(projectKeywords.keywordId, keywords.id))
    .where(and(...conditions))
    .orderBy(orderBy, desc(projectKeywords.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    total: totalRow?.value ?? 0,
    rows: rows.map((row) => ({
      projectKeywordId: row.projectKeywordId,
      keywordId: row.keywordId,
      keyword: row.keyword,
      position: row.position,
      previousPosition: row.previousPosition,
      change:
        row.position != null && row.previousPosition != null
          ? row.previousPosition - row.position
          : null,
      bestPosition: row.bestPosition,
      rankingUrl: row.rankingUrl,
      lastCheckedAt: row.lastCheckedAt
        ? new Date(row.lastCheckedAt).toISOString()
        : null,
    })),
  }
}

export type RankingTrendPoint = {
  /** Check day, YYYY-MM-DD (UTC). */
  date: string
  avgPosition: number | null
  top3: number
  top10: number
  top100: number
  /** Rank checks recorded that day (including "not in top 100" results). */
  checks: number
  /**
   * 0-100 visibility score: average of (101 - position) over the day's
   * checks, counting unranked keywords as 0.
   */
  visibility: number
}

export async function getRankingTrendForProject(
  userId: string,
  projectId: string,
  input: { days?: number } = {},
  database: CustomShellDb = db
): Promise<RankingTrendPoint[]> {
  await getOwnedProject(userId, projectId, database)

  const days = Math.max(7, Math.min(input.days ?? 30, 365))
  const result = await database.execute(sql`
    select
      to_char(date_trunc('day', r.checked_at at time zone 'UTC'), 'YYYY-MM-DD') as date,
      avg(r.position)::float as avg_position,
      count(*) filter (where r.position <= 3)::int as top3,
      count(*) filter (where r.position <= 10)::int as top10,
      count(*) filter (where r.position is not null)::int as top100,
      count(*)::int as checks,
      avg(coalesce(101 - r.position, 0))::float as visibility
    from ${keywordRankings} r
    where r.project_id = ${projectId}
      and r.checked_at >= now() - make_interval(days => ${days})
    group by 1
    order by 1
  `)

  const rows = result.rows as Array<{
    date: string
    avg_position: number | null
    top3: number
    top10: number
    top100: number
    checks: number
    visibility: number | null
  }>

  return rows.map((row) => ({
    date: row.date,
    avgPosition:
      row.avg_position != null
        ? Math.round(Number(row.avg_position) * 10) / 10
        : null,
    top3: row.top3,
    top10: row.top10,
    top100: row.top100,
    checks: row.checks,
    visibility:
      row.visibility != null
        ? Math.round(Number(row.visibility) * 10) / 10
        : 0,
  }))
}

export type RankingHistoryEntry = {
  position: number | null
  rankingUrl: string | null
  rankingTitle: string | null
  topResults: Array<{
    position: number | null
    domain: string | null
    url: string | null
    title: string | null
  }> | null
  checkedAt: string
}

export async function getRankingHistoryForUser(
  userId: string,
  projectId: string,
  projectKeywordId: string,
  database: CustomShellDb = db
): Promise<{ keyword: string; history: RankingHistoryEntry[] }> {
  await getOwnedProject(userId, projectId, database)

  const [projectKeyword] = await database
    .select({ keywordId: projectKeywords.keywordId, keyword: keywords.keyword })
    .from(projectKeywords)
    .innerJoin(keywords, eq(projectKeywords.keywordId, keywords.id))
    .where(
      and(
        eq(projectKeywords.id, projectKeywordId),
        eq(projectKeywords.projectId, projectId)
      )
    )
    .limit(1)

  if (!projectKeyword) {
    throw new Error("Keyword not found")
  }

  const rows = await database
    .select()
    .from(keywordRankings)
    .where(
      and(
        eq(keywordRankings.projectId, projectId),
        eq(keywordRankings.keywordId, projectKeyword.keywordId)
      )
    )
    .orderBy(asc(keywordRankings.checkedAt))
    .limit(200)

  return {
    keyword: projectKeyword.keyword,
    history: rows.map((row) => ({
      position: row.position,
      rankingUrl: row.rankingUrl,
      rankingTitle: row.rankingTitle,
      topResults: Array.isArray(row.topResults)
        ? (row.topResults as RankingHistoryEntry["topResults"])
        : null,
      checkedAt: row.checkedAt.toISOString(),
    })),
  }
}
