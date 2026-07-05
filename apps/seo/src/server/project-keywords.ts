import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm"

import type {
  KeywordStatus,
  MonthlySearch,
  ScoreExplanation,
  SearchIntent,
} from "@/lib/keyword-research"
import { parseSearchIntent } from "@/lib/keyword-research"
import { db, type CustomShellDb } from "@/server/db"
import { getOwnedProject } from "@/server/seo-projects"
import {
  keywordMetrics,
  keywords,
  projectKeywords,
} from "@/server/schema"

export type KeywordFilters = {
  q?: string
  minVolume?: number
  maxDifficulty?: number
  intent?: SearchIntent[]
  minCpc?: number
  maxCpc?: number
  competitionLevel?: string[]
  includeWords?: string[]
  excludeWords?: string[]
  status?: KeywordStatus[]
  source?: string[]
  questionOnly?: boolean
  localOnly?: boolean
  clusterId?: string
}

export type KeywordSortField =
  | "opportunityScore"
  | "searchVolume"
  | "keywordDifficulty"
  | "cpc"
  | "trendScore"
  | "createdAt"

export type KeywordSort = {
  field: KeywordSortField
  direction: "asc" | "desc"
}

export type ProjectKeywordRow = {
  id: string
  keywordId: string
  keyword: string
  intent: SearchIntent
  searchVolume: number | null
  cpc: number | null
  competition: number | null
  competitionLevel: string | null
  keywordDifficulty: number | null
  trendScore: number | null
  opportunityScore: number | null
  status: KeywordStatus
  source: string
  suggestedPageType: string | null
  assignedUrl: string | null
  notes: string | null
  serpFeatures: string[] | null
  trackedAt: string | null
  createdAt: string
}

const QUESTION_PATTERN = "^(how|what|why|when|where|who|can|does|do|is|are)\\M"
const LOCAL_PATTERN =
  "\\m(near me|toronto|vancouver|calgary|montreal|ottawa|city|local)\\M"

function buildConditions(projectId: string, filters: KeywordFilters): SQL[] {
  const conditions: SQL[] = [eq(projectKeywords.projectId, projectId)]

  if (filters.q?.trim()) {
    conditions.push(
      sql`${keywords.keyword} ilike ${`%${filters.q.trim()}%`}`
    )
  }
  if (filters.minVolume != null) {
    conditions.push(
      sql`${keywordMetrics.searchVolume} >= ${filters.minVolume}`
    )
  }
  if (filters.maxDifficulty != null) {
    conditions.push(
      sql`${keywordMetrics.keywordDifficulty} <= ${filters.maxDifficulty}`
    )
  }
  if (filters.intent?.length) {
    conditions.push(
      inArray(sql`coalesce(${keywordMetrics.intent}, 'unknown')`, filters.intent)
    )
  }
  if (filters.minCpc != null) {
    conditions.push(sql`${keywordMetrics.cpc} >= ${filters.minCpc}`)
  }
  if (filters.maxCpc != null) {
    conditions.push(sql`${keywordMetrics.cpc} <= ${filters.maxCpc}`)
  }
  if (filters.competitionLevel?.length) {
    conditions.push(
      inArray(keywordMetrics.competitionLevel, filters.competitionLevel)
    )
  }
  for (const word of filters.includeWords ?? []) {
    if (word.trim()) {
      conditions.push(sql`${keywords.keyword} ilike ${`%${word.trim()}%`}`)
    }
  }
  for (const word of filters.excludeWords ?? []) {
    if (word.trim()) {
      conditions.push(
        sql`${keywords.keyword} not ilike ${`%${word.trim()}%`}`
      )
    }
  }
  if (filters.status?.length) {
    conditions.push(inArray(projectKeywords.status, filters.status))
  } else {
    // Ignored keywords are hidden unless explicitly requested.
    conditions.push(sql`${projectKeywords.status} <> 'ignored'`)
  }
  if (filters.source?.length) {
    conditions.push(inArray(projectKeywords.source, filters.source))
  }
  if (filters.clusterId) {
    conditions.push(eq(projectKeywords.clusterId, filters.clusterId))
  }
  if (filters.questionOnly) {
    conditions.push(sql`${keywords.keyword} ~* ${QUESTION_PATTERN}`)
  }
  if (filters.localOnly) {
    conditions.push(sql`${keywords.keyword} ~* ${LOCAL_PATTERN}`)
  }

  return conditions
}

const sortColumns: Record<KeywordSortField, SQL> = {
  opportunityScore: sql`${projectKeywords.opportunityScore}`,
  searchVolume: sql`${keywordMetrics.searchVolume}`,
  keywordDifficulty: sql`${keywordMetrics.keywordDifficulty}`,
  cpc: sql`${keywordMetrics.cpc}`,
  trendScore: sql`${keywordMetrics.trendScore}`,
  createdAt: sql`${projectKeywords.createdAt}`,
}

const rowSelection = {
  id: projectKeywords.id,
  keywordId: projectKeywords.keywordId,
  keyword: keywords.keyword,
  intent: keywordMetrics.intent,
  searchVolume: keywordMetrics.searchVolume,
  cpc: keywordMetrics.cpc,
  competition: keywordMetrics.competition,
  competitionLevel: keywordMetrics.competitionLevel,
  keywordDifficulty: keywordMetrics.keywordDifficulty,
  trendScore: keywordMetrics.trendScore,
  opportunityScore: projectKeywords.opportunityScore,
  status: projectKeywords.status,
  source: projectKeywords.source,
  suggestedPageType: projectKeywords.suggestedPageType,
  assignedUrl: projectKeywords.assignedUrl,
  notes: projectKeywords.notes,
  serpFeatures: keywordMetrics.serpFeatures,
  trackedAt: projectKeywords.trackedAt,
  createdAt: projectKeywords.createdAt,
}

function toRow(row: {
  id: string
  keywordId: string
  keyword: string
  intent: string | null
  searchVolume: number | null
  cpc: string | null
  competition: string | null
  competitionLevel: string | null
  keywordDifficulty: number | null
  trendScore: number | null
  opportunityScore: number | null
  status: string
  source: string
  suggestedPageType: string | null
  assignedUrl: string | null
  notes: string | null
  serpFeatures: unknown
  trackedAt: Date | null
  createdAt: Date
}): ProjectKeywordRow {
  return {
    id: row.id,
    keywordId: row.keywordId,
    keyword: row.keyword,
    intent: parseSearchIntent(row.intent),
    searchVolume: row.searchVolume,
    cpc: row.cpc != null ? Number(row.cpc) : null,
    competition: row.competition != null ? Number(row.competition) : null,
    competitionLevel: row.competitionLevel,
    keywordDifficulty: row.keywordDifficulty,
    trendScore: row.trendScore,
    opportunityScore: row.opportunityScore,
    status: row.status as KeywordStatus,
    source: row.source,
    suggestedPageType: row.suggestedPageType,
    assignedUrl: row.assignedUrl,
    notes: row.notes,
    serpFeatures: Array.isArray(row.serpFeatures)
      ? (row.serpFeatures as string[])
      : null,
    trackedAt: row.trackedAt ? row.trackedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listProjectKeywordsForUser(
  userId: string,
  input: {
    projectId: string
    filters?: KeywordFilters
    sort?: KeywordSort
    pagination: { page: number; pageSize: number }
  },
  database: CustomShellDb = db
): Promise<{ rows: ProjectKeywordRow[]; total: number }> {
  await getOwnedProject(userId, input.projectId, database)

  const conditions = buildConditions(input.projectId, input.filters ?? {})
  const sort = input.sort ?? { field: "opportunityScore", direction: "desc" }
  const sortColumn = sortColumns[sort.field] ?? sortColumns.opportunityScore
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
    .leftJoin(keywordMetrics, eq(keywordMetrics.keywordId, keywords.id))
    .where(and(...conditions))

  const rows = await database
    .select(rowSelection)
    .from(projectKeywords)
    .innerJoin(keywords, eq(projectKeywords.keywordId, keywords.id))
    .leftJoin(keywordMetrics, eq(keywordMetrics.keywordId, keywords.id))
    .where(and(...conditions))
    .orderBy(orderBy, desc(projectKeywords.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return { rows: rows.map(toRow), total: totalRow?.value ?? 0 }
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type ProjectKeywordDetail = ProjectKeywordRow & {
  monthlySearches: MonthlySearch[] | null
  intentProbability: number | null
  secondaryIntents: JsonValue
  scoreExplanation: ScoreExplanation | null
  sourceDetails: Record<string, JsonValue> | null
  lowTopOfPageBid: number | null
  highTopOfPageBid: number | null
}

export async function getProjectKeywordDetailForUser(
  userId: string,
  projectId: string,
  projectKeywordId: string,
  database: CustomShellDb = db
): Promise<ProjectKeywordDetail> {
  await getOwnedProject(userId, projectId, database)

  const [row] = await database
    .select({
      ...rowSelection,
      monthlySearches: keywordMetrics.monthlySearches,
      intentProbability: keywordMetrics.intentProbability,
      secondaryIntents: keywordMetrics.secondaryIntents,
      scoreExplanation: projectKeywords.scoreExplanation,
      sourceDetails: projectKeywords.sourceDetails,
      lowTopOfPageBid: keywordMetrics.lowTopOfPageBid,
      highTopOfPageBid: keywordMetrics.highTopOfPageBid,
    })
    .from(projectKeywords)
    .innerJoin(keywords, eq(projectKeywords.keywordId, keywords.id))
    .leftJoin(keywordMetrics, eq(keywordMetrics.keywordId, keywords.id))
    .where(
      and(
        eq(projectKeywords.id, projectKeywordId),
        eq(projectKeywords.projectId, projectId)
      )
    )
    .limit(1)

  if (!row) {
    throw new Error("Keyword not found")
  }

  return {
    ...toRow(row),
    monthlySearches: Array.isArray(row.monthlySearches)
      ? (row.monthlySearches as MonthlySearch[])
      : null,
    intentProbability:
      row.intentProbability != null ? Number(row.intentProbability) : null,
    secondaryIntents: (row.secondaryIntents as JsonValue) ?? null,
    scoreExplanation: (row.scoreExplanation as ScoreExplanation | null) ?? null,
    sourceDetails:
      (row.sourceDetails as Record<string, JsonValue> | null) ?? null,
    lowTopOfPageBid:
      row.lowTopOfPageBid != null ? Number(row.lowTopOfPageBid) : null,
    highTopOfPageBid:
      row.highTopOfPageBid != null ? Number(row.highTopOfPageBid) : null,
  }
}

export async function updateProjectKeywordStatusForUser(
  userId: string,
  projectId: string,
  projectKeywordIds: string[],
  status: KeywordStatus,
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)
  if (!projectKeywordIds.length) return { updated: 0 }

  const updated = await database
    .update(projectKeywords)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(projectKeywords.projectId, projectId),
        inArray(projectKeywords.id, projectKeywordIds)
      )
    )
    .returning({ id: projectKeywords.id })

  return { updated: updated.length }
}

export async function updateProjectKeywordPlanForUser(
  userId: string,
  projectId: string,
  projectKeywordId: string,
  input: { notes?: string; assignedUrl?: string; status?: KeywordStatus },
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)

  const [updated] = await database
    .update(projectKeywords)
    .set({
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(input.assignedUrl !== undefined
        ? { assignedUrl: input.assignedUrl || null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectKeywords.id, projectKeywordId),
        eq(projectKeywords.projectId, projectId)
      )
    )
    .returning({ id: projectKeywords.id })

  if (!updated) {
    throw new Error("Keyword not found")
  }
  return updated
}

export type CsvExportMode =
  | "all"
  | "filtered"
  | "selected"
  | "saved"
  | "content_plan"

const CSV_COLUMNS = [
  "keyword",
  "intent",
  "search_volume",
  "trend_score",
  "cpc",
  "competition",
  "competition_level",
  "keyword_difficulty",
  "opportunity_score",
  "status",
  "suggested_page_type",
  "assigned_url",
  "source",
  "notes",
] as const

function csvEscape(value: string) {
  // Neutralize spreadsheet formula injection: a leading =, +, -, @, tab, or CR
  // makes Excel/Sheets evaluate the cell as a formula on open.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded
}

export async function exportProjectKeywordsCsvForUser(
  userId: string,
  input: {
    projectId: string
    mode: CsvExportMode
    filters?: KeywordFilters
    selectedIds?: string[]
  },
  database: CustomShellDb = db
): Promise<{ filename: string; csv: string }> {
  await getOwnedProject(userId, input.projectId, database)

  let filters: KeywordFilters = {}
  if (input.mode === "filtered") {
    filters = input.filters ?? {}
  } else if (input.mode === "saved") {
    filters = { status: ["saved"] }
  } else if (input.mode === "content_plan") {
    filters = { status: ["saved", "planned", "published"] }
  } else if (input.mode === "all") {
    filters = {
      status: ["new", "saved", "ignored", "planned", "published"],
    }
  }

  const conditions = buildConditions(input.projectId, filters)
  if (input.mode === "selected") {
    conditions.push(
      inArray(projectKeywords.id, input.selectedIds?.length ? input.selectedIds : [""])
    )
  }

  const rows = await database
    .select(rowSelection)
    .from(projectKeywords)
    .innerJoin(keywords, eq(projectKeywords.keywordId, keywords.id))
    .leftJoin(keywordMetrics, eq(keywordMetrics.keywordId, keywords.id))
    .where(and(...conditions))
    .orderBy(sql`${projectKeywords.opportunityScore} desc nulls last`)
    .limit(10000)

  const lines = [CSV_COLUMNS.join(",")]
  for (const raw of rows) {
    const row = toRow(raw)
    lines.push(
      [
        row.keyword,
        row.intent,
        row.searchVolume ?? "",
        row.trendScore ?? "",
        row.cpc ?? "",
        row.competition ?? "",
        row.competitionLevel ?? "",
        row.keywordDifficulty ?? "",
        row.opportunityScore ?? "",
        row.status,
        row.suggestedPageType ?? "",
        row.assignedUrl ?? "",
        row.source,
        row.notes ?? "",
      ]
        .map((value) => csvEscape(String(value)))
        .join(",")
    )
  }

  const date = new Date().toISOString().slice(0, 10)
  return {
    filename: `keywords-${input.mode}-${date}.csv`,
    csv: lines.join("\r\n"),
  }
}
