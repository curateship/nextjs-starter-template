import { and, asc, count, eq, inArray, sql } from "drizzle-orm"

import type { KeywordStatus } from "@/lib/keyword-research"
import { db, type CustomShellDb } from "@/server/db"
import { getOwnedProject } from "@/server/seo-projects"
import {
  keywordClusters,
  keywordMetrics,
  keywords,
  projectKeywords,
} from "@/server/schema"

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "best", "but", "by", "can",
  "do", "does", "for", "from", "get", "how", "i", "in", "is", "it", "me",
  "my", "near", "of", "on", "or", "our", "so", "that", "the", "their",
  "this", "to", "top", "vs", "was", "what", "when", "where", "which",
  "who", "why", "will", "with", "you", "your",
])

/** Lowercases, splits, drops stopwords/short tokens, strips plural "s". */
export function tokenizeKeyword(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) =>
      token.length > 3 && token.endsWith("s") && !token.endsWith("ss")
        ? token.slice(0, -1)
        : token
    )
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
}

/**
 * Groups keywords by their most frequent shared token: each keyword joins
 * the cluster of its highest-frequency token (ties broken by longer token).
 * Keywords with no usable token land in "other".
 */
export function assignClusterAnchors(
  items: Array<{ id: string; keyword: string }>
): Map<string, string[]> {
  const tokensById = new Map<string, string[]>()
  const frequency = new Map<string, number>()

  for (const item of items) {
    const tokens = [...new Set(tokenizeKeyword(item.keyword))]
    tokensById.set(item.id, tokens)
    for (const token of tokens) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1)
    }
  }

  const clusters = new Map<string, string[]>()
  for (const item of items) {
    const tokens = tokensById.get(item.id) ?? []
    let anchor = "other"
    let bestScore = 0
    for (const token of tokens) {
      const score = frequency.get(token) ?? 0
      if (
        score > bestScore ||
        (score === bestScore && anchor !== "other" && token.length > anchor.length)
      ) {
        anchor = token
        bestScore = score
      }
    }
    const members = clusters.get(anchor) ?? []
    members.push(item.id)
    clusters.set(anchor, members)
  }

  return clusters
}

const MAX_CLUSTERED_KEYWORDS = 10000

export async function rebuildClustersForProject(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<{ clusters: number; keywords: number }> {
  await getOwnedProject(userId, projectId, database)

  const rows = await database
    .select({ id: projectKeywords.id, keyword: keywords.keyword })
    .from(projectKeywords)
    .innerJoin(keywords, eq(projectKeywords.keywordId, keywords.id))
    .where(
      and(
        eq(projectKeywords.projectId, projectId),
        sql`${projectKeywords.status} <> 'ignored'`
      )
    )
    .limit(MAX_CLUSTERED_KEYWORDS)

  await database
    .delete(keywordClusters)
    .where(eq(keywordClusters.projectId, projectId))

  if (!rows.length) {
    return { clusters: 0, keywords: 0 }
  }

  const anchors = assignClusterAnchors(rows)
  let clusterCount = 0

  for (const [anchor, memberIds] of anchors) {
    const [cluster] = await database
      .insert(keywordClusters)
      .values({ projectId, name: anchor, anchor })
      .returning({ id: keywordClusters.id })
    if (!cluster) continue
    clusterCount += 1

    for (let index = 0; index < memberIds.length; index += 500) {
      await database
        .update(projectKeywords)
        .set({ clusterId: cluster.id, updatedAt: new Date() })
        .where(
          and(
            eq(projectKeywords.projectId, projectId),
            inArray(projectKeywords.id, memberIds.slice(index, index + 500))
          )
        )
    }
  }

  return { clusters: clusterCount, keywords: rows.length }
}

export type ClusterSortField = "name" | "keywords" | "volume" | "opportunity"

export type ClusterRow = {
  id: string
  name: string
  keywordCount: number
  totalVolume: number
  avgDifficulty: number | null
  bestOpportunity: number | null
  topKeyword: string | null
}

export async function listClustersForProject(
  userId: string,
  input: {
    projectId: string
    q?: string
    sort?: { field: ClusterSortField; direction: "asc" | "desc" }
    pagination: { page: number; pageSize: number }
  },
  database: CustomShellDb = db
): Promise<{ rows: ClusterRow[]; total: number; unclusteredCount: number }> {
  await getOwnedProject(userId, input.projectId, database)

  const conditions = [eq(keywordClusters.projectId, input.projectId)]
  if (input.q?.trim()) {
    conditions.push(
      sql`${keywordClusters.name} ilike ${`%${input.q.trim()}%`}`
    )
  }

  const keywordCount = sql<number>`(
    select count(*)::int from ${projectKeywords} pk
    where pk.cluster_id = "keyword_clusters"."id"
  )`
  const totalVolume = sql<string | null>`(
    select sum(m.search_volume) from ${projectKeywords} pk
    join ${keywordMetrics} m on m.keyword_id = pk.keyword_id
    where pk.cluster_id = "keyword_clusters"."id"
  )`
  const avgDifficulty = sql<string | null>`(
    select round(avg(m.keyword_difficulty)) from ${projectKeywords} pk
    join ${keywordMetrics} m on m.keyword_id = pk.keyword_id
    where pk.cluster_id = "keyword_clusters"."id"
  )`
  const bestOpportunity = sql<number | null>`(
    select max(pk.opportunity_score) from ${projectKeywords} pk
    where pk.cluster_id = "keyword_clusters"."id"
  )`
  const topKeyword = sql<string | null>`(
    select k.keyword from ${projectKeywords} pk
    join ${keywords} k on k.id = pk.keyword_id
    left join ${keywordMetrics} m on m.keyword_id = pk.keyword_id
    where pk.cluster_id = "keyword_clusters"."id"
    order by m.search_volume desc nulls last limit 1
  )`

  const sort = input.sort ?? { field: "keywords", direction: "desc" }
  const sortColumn = {
    name: sql`${keywordClusters.name}`,
    keywords: keywordCount,
    volume: totalVolume,
    opportunity: bestOpportunity,
  }[sort.field]
  const orderBy =
    sort.direction === "asc"
      ? sql`${sortColumn} asc nulls last`
      : sql`${sortColumn} desc nulls last`

  const page = Math.max(1, input.pagination.page)
  const pageSize = Math.max(1, Math.min(input.pagination.pageSize, 100))

  const [totalRow] = await database
    .select({ value: count() })
    .from(keywordClusters)
    .where(and(...conditions))

  const [unclusteredRow] = await database
    .select({ value: count() })
    .from(projectKeywords)
    .where(
      and(
        eq(projectKeywords.projectId, input.projectId),
        sql`${projectKeywords.clusterId} is null`,
        sql`${projectKeywords.status} <> 'ignored'`
      )
    )

  const rows = await database
    .select({
      id: keywordClusters.id,
      name: keywordClusters.name,
      keywordCount,
      totalVolume,
      avgDifficulty,
      bestOpportunity,
      topKeyword,
    })
    .from(keywordClusters)
    .where(and(...conditions))
    .orderBy(orderBy, asc(keywordClusters.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    total: totalRow?.value ?? 0,
    unclusteredCount: unclusteredRow?.value ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      keywordCount: row.keywordCount ?? 0,
      totalVolume: Number(row.totalVolume ?? 0),
      avgDifficulty: row.avgDifficulty != null ? Number(row.avgDifficulty) : null,
      bestOpportunity: row.bestOpportunity,
      topKeyword: row.topKeyword,
    })),
  }
}

export async function renameCluster(
  userId: string,
  projectId: string,
  clusterId: string,
  name: string,
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error("Cluster name is required")
  }

  const [updated] = await database
    .update(keywordClusters)
    .set({ name: trimmed.slice(0, 100) })
    .where(
      and(
        eq(keywordClusters.id, clusterId),
        eq(keywordClusters.projectId, projectId)
      )
    )
    .returning({ id: keywordClusters.id })

  if (!updated) {
    throw new Error("Cluster not found")
  }
  return updated
}

export async function updateClusterStatus(
  userId: string,
  projectId: string,
  clusterId: string,
  status: KeywordStatus,
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)

  const updated = await database
    .update(projectKeywords)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(projectKeywords.projectId, projectId),
        eq(projectKeywords.clusterId, clusterId)
      )
    )
    .returning({ id: projectKeywords.id })

  return { updated: updated.length }
}

export async function countClustersForProject(
  projectId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select({ value: count() })
    .from(keywordClusters)
    .where(eq(keywordClusters.projectId, projectId))
  return row?.value ?? 0
}
