import { and, desc, eq, inArray, sql } from "drizzle-orm"

import {
  calculateOpportunityScore,
  calculateTrendScore,
  isValidAdsKeyword,
  normalizeKeyword,
  parseSearchIntent,
  suggestGapAction,
  suggestPageType,
  type KeywordJobType,
  type MonthlySearch,
  type SearchIntent,
} from "@/lib/keyword-research"
import {
  collectTaskResults,
  dataForSeoPost,
  type ApiCallContext,
} from "@/server/dataforseo"
import { db, type CustomShellDb } from "@/server/db"
import { getOwnedProject, parseProjectDomain } from "@/server/seo-projects"
import {
  keywordJobs,
  keywordMetrics,
  keywords,
  projectCompetitors,
  projectKeywords,
  type KeywordJob,
  type Project,
} from "@/server/schema"

const METRICS_FRESH_DAYS = 30
const API_BATCH_SIZE = 700

function envLimit(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] || "", 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export type SeedJobInput = {
  seedKeywords: string[]
  limit: number
  includeRelated: boolean
}

export type DomainJobInput = {
  domain: string
  limit: number
}

export type CompetitorGapJobInput = {
  competitorDomain: string
  limit: number
}

class JobCancelledError extends Error {
  constructor() {
    super("Job was cancelled")
    this.name = "JobCancelledError"
  }
}

export async function createSeedKeywordJobForUser(
  userId: string,
  projectId: string,
  input: { seedKeywords: string[]; limit?: number; includeRelated?: boolean },
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)

  const seeds = [
    ...new Set(
      input.seedKeywords
        .map(normalizeKeyword)
        .filter((keyword) => keyword.length > 0)
    ),
  ]
  if (!seeds.length) {
    throw new Error("Enter at least one seed keyword.")
  }
  const maxSeeds = envLimit("MAX_SEED_KEYWORDS_PER_JOB", 20)
  if (seeds.length > maxSeeds) {
    throw new Error(`Reduce the keyword list to ${maxSeeds} seeds and try again.`)
  }
  const invalid = seeds.find((seed) => !isValidAdsKeyword(seed))
  if (invalid) {
    throw new Error(
      `"${invalid.slice(0, 40)}" is too long. Seeds must be at most 80 characters and 10 words.`
    )
  }

  const limit = clampLimit(input.limit, envLimit("MAX_RESULTS_PER_SEED_JOB", 5000))
  return insertAndRunJob(userId, projectId, "seed_research", {
    seedKeywords: seeds,
    limit,
    includeRelated: input.includeRelated ?? false,
  } satisfies SeedJobInput, database)
}

export async function createDomainKeywordJobForUser(
  userId: string,
  projectId: string,
  input: { domain: string; limit?: number },
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)
  const domain = parseProjectDomain(input.domain)
  const limit = clampLimit(
    input.limit,
    envLimit("MAX_RESULTS_PER_DOMAIN_JOB", 5000)
  )
  return insertAndRunJob(
    userId,
    projectId,
    "domain_research",
    { domain, limit } satisfies DomainJobInput,
    database
  )
}

export async function createCompetitorGapJobForUser(
  userId: string,
  projectId: string,
  input: { competitorDomain: string; limit?: number },
  database: CustomShellDb = db
) {
  const gapProject = await getOwnedProject(userId, projectId, database)
  if (!gapProject.normalizedDomain) {
    throw new Error(
      "Set a domain in Settings → Project before running gap analysis."
    )
  }
  const competitorDomain = parseProjectDomain(input.competitorDomain)

  const [competitor] = await database
    .select({ id: projectCompetitors.id })
    .from(projectCompetitors)
    .where(
      and(
        eq(projectCompetitors.projectId, projectId),
        eq(projectCompetitors.normalizedDomain, competitorDomain)
      )
    )
    .limit(1)
  if (!competitor) {
    throw new Error("Add this competitor to the project first.")
  }

  const limit = clampLimit(
    input.limit,
    envLimit("MAX_RESULTS_PER_COMPETITOR_JOB", 5000)
  )
  return insertAndRunJob(
    userId,
    projectId,
    "competitor_gap",
    { competitorDomain, limit } satisfies CompetitorGapJobInput,
    database
  )
}

export async function createRankCheckJobForUser(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
) {
  const rankProject = await getOwnedProject(userId, projectId, database)
  if (!rankProject.normalizedDomain) {
    throw new Error(
      "Set a domain in Settings → Project before checking rankings."
    )
  }

  const { listTrackedKeywords } = await import("@/server/rank-tracker")
  const tracked = await listTrackedKeywords(projectId, 1, database)
  if (!tracked.length) {
    throw new Error("Track at least one keyword before checking rankings.")
  }

  return insertAndRunJob(userId, projectId, "rank_check", {}, database)
}

export async function createMetricsRefreshJobForUser(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)

  const [existing] = await database
    .select({ id: projectKeywords.id })
    .from(projectKeywords)
    .where(eq(projectKeywords.projectId, projectId))
    .limit(1)
  if (!existing) {
    throw new Error("Run keyword research before refreshing metrics.")
  }

  return insertAndRunJob(userId, projectId, "metrics_enrichment", {}, database)
}

function clampLimit(limit: number | undefined, max: number) {
  // Labs live endpoints return at most 1000 items per request.
  return Math.max(10, Math.min(limit ?? 300, max, 1000))
}

async function insertAndRunJob(
  userId: string,
  projectId: string,
  type: KeywordJobType,
  input: unknown,
  database: CustomShellDb
) {
  const [job] = await database
    .insert(keywordJobs)
    .values({ userId, projectId, type, input, status: "pending" })
    .returning()

  if (!job) {
    throw new Error("Job was not created")
  }
  queueKeywordJobRun(job.id, database)
  return job
}

export function queueKeywordJobRun(jobId: string, database: CustomShellDb = db) {
  setImmediate(() => {
    runKeywordJob(jobId, database).catch((error) => {
      console.error(`Keyword job ${jobId} crashed`, error)
    })
  })
}

export async function getJobForUser(
  userId: string,
  jobId: string,
  database: CustomShellDb = db
) {
  const [job] = await database
    .select()
    .from(keywordJobs)
    .where(and(eq(keywordJobs.id, jobId), eq(keywordJobs.userId, userId)))
    .limit(1)
  if (!job) {
    throw new Error("Job not found")
  }
  return job
}

export async function listRecentJobsForProject(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)
  return database
    .select()
    .from(keywordJobs)
    .where(eq(keywordJobs.projectId, projectId))
    .orderBy(desc(keywordJobs.createdAt))
    .limit(10)
}

export async function retryJobForUser(
  userId: string,
  jobId: string,
  database: CustomShellDb = db
) {
  const job = await getJobForUser(userId, jobId, database)
  if (job.status !== "failed" && job.status !== "cancelled") {
    throw new Error("Only failed or cancelled jobs can be retried.")
  }
  const [updated] = await database
    .update(keywordJobs)
    .set({
      status: "pending",
      progress: 0,
      currentStep: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(keywordJobs.id, jobId))
    .returning()
  queueKeywordJobRun(jobId, database)
  return updated ?? job
}

export async function cancelJobForUser(
  userId: string,
  jobId: string,
  database: CustomShellDb = db
) {
  const job = await getJobForUser(userId, jobId, database)
  if (job.status !== "pending" && job.status !== "running") {
    throw new Error("Only pending or running jobs can be cancelled.")
  }
  const [updated] = await database
    .update(keywordJobs)
    .set({
      status: "cancelled",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(keywordJobs.id, jobId))
    .returning()
  return updated ?? job
}

// --- Job runner -----------------------------------------------------------

type DiscoveredKeyword = {
  keyword: string
  metrics: DiscoveredMetrics
  sourceDetails?: Record<string, unknown>
}

type DiscoveredMetrics = {
  searchVolume?: number | null
  monthlySearches?: MonthlySearch[] | null
  cpc?: number | null
  competition?: number | null
  competitionLevel?: string | null
  lowTopOfPageBid?: number | null
  highTopOfPageBid?: number | null
  keywordDifficulty?: number | null
  intent?: SearchIntent | null
  intentProbability?: number | null
  secondaryIntents?: unknown
  serpFeatures?: unknown
  sourceEndpoint: string
}

type LabsKeywordData = {
  keyword?: string
  keyword_info?: {
    search_volume?: number | null
    cpc?: number | null
    competition?: number | null
    competition_level?: string | null
    low_top_of_page_bid?: number | null
    high_top_of_page_bid?: number | null
    monthly_searches?: MonthlySearch[] | null
  } | null
  keyword_properties?: { keyword_difficulty?: number | null } | null
  search_intent_info?: {
    main_intent?: string | null
    foreign_intent?: string[] | null
  } | null
  serp_info?: { serp_item_types?: string[] | null } | null
}

export async function runKeywordJob(
  jobId: string,
  database: CustomShellDb = db
) {
  const [job] = await database
    .select()
    .from(keywordJobs)
    .where(eq(keywordJobs.id, jobId))
    .limit(1)
  if (!job || job.status !== "pending") return

  const project = await getOwnedProject(job.userId, job.projectId, database)
  const context: ApiCallContext = {
    userId: job.userId,
    projectId: job.projectId,
    jobId: job.id,
    endpointName: job.type,
  }

  await updateJob(database, job.id, {
    status: "running",
    startedAt: new Date(),
    progress: 5,
    currentStep: "Starting research",
  })

  try {
    if (job.type === "metrics_enrichment") {
      await setStep(database, job.id, 10, "Refreshing keyword metrics")
      const keywordIds = (
        await database
          .select({ keywordId: projectKeywords.keywordId })
          .from(projectKeywords)
          .where(eq(projectKeywords.projectId, project.id))
          .limit(envLimit("MAX_ENRICHMENT_KEYWORDS_PER_JOB", 10000))
      ).map((row) => row.keywordId)

      const errors = await enrichKeywords(
        database,
        job,
        project,
        context,
        keywordIds
      )
      await setStep(database, job.id, 85, "Scoring keywords")
      await scoreProjectKeywords(database, project.id)
      await updateJob(database, job.id, {
        status: "completed",
        progress: 100,
        currentStep: errors.length
          ? `Completed with ${errors.length} failed enrichment batch(es)`
          : "Completed",
        errorMessage: errors.length ? errors.slice(0, 3).join("; ") : null,
        completedAt: new Date(),
      })
      return
    }

    if (job.type === "rank_check") {
      const errors = await runRankCheck(database, job, project, context)
      await updateJob(database, job.id, {
        status: "completed",
        progress: 100,
        currentStep: errors.length
          ? `Completed with ${errors.length} failed check(s)`
          : "Completed",
        errorMessage: errors.length ? errors.slice(0, 3).join("; ") : null,
        completedAt: new Date(),
      })
      return
    }

    let discovered: DiscoveredKeyword[]
    let source: string
    if (job.type === "seed_research") {
      source = "seed_research"
      discovered = await discoverSeedKeywords(
        database,
        job,
        project,
        context,
        job.input as SeedJobInput
      )
    } else if (job.type === "domain_research") {
      source = "domain_research"
      discovered = await discoverDomainKeywords(
        database,
        job,
        project,
        context,
        job.input as DomainJobInput
      )
    } else if (job.type === "competitor_gap") {
      source = "competitor_gap"
      discovered = await discoverCompetitorGapKeywords(
        database,
        job,
        project,
        context,
        job.input as CompetitorGapJobInput
      )
    } else {
      throw new Error(`Unsupported job type: ${job.type}`)
    }

    const deduped = dedupeDiscovered(discovered)
    if (!deduped.length) {
      await updateJob(database, job.id, {
        status: "completed",
        progress: 100,
        currentStep: "No keyword ideas found",
        completedAt: new Date(),
      })
      return
    }

    await setStep(database, job.id, 40, "Saving keywords")
    const keywordIds = await upsertDiscoveredKeywords(
      database,
      project,
      deduped,
      source
    )

    await setStep(database, job.id, 55, "Enriching keyword metrics")
    const enrichmentErrors = await enrichKeywords(
      database,
      job,
      project,
      context,
      keywordIds
    )

    await setStep(database, job.id, 85, "Scoring keywords")
    await scoreProjectKeywords(database, project.id)

    await updateJob(database, job.id, {
      status: "completed",
      progress: 100,
      currentStep: enrichmentErrors.length
        ? `Completed with ${enrichmentErrors.length} failed enrichment batch(es)`
        : "Completed",
      errorMessage: enrichmentErrors.length
        ? enrichmentErrors.slice(0, 3).join("; ")
        : null,
      completedAt: new Date(),
    })
  } catch (error) {
    if (error instanceof JobCancelledError) return
    await updateJob(database, job.id, {
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "Keyword job failed.",
      completedAt: new Date(),
    })
  }
}

async function updateJob(
  database: CustomShellDb,
  jobId: string,
  values: Partial<typeof keywordJobs.$inferInsert>
) {
  await database
    .update(keywordJobs)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(keywordJobs.id, jobId))
}

async function setStep(
  database: CustomShellDb,
  jobId: string,
  progress: number,
  currentStep: string
) {
  await assertNotCancelled(database, jobId)
  await updateJob(database, jobId, { progress, currentStep })
}

async function assertNotCancelled(database: CustomShellDb, jobId: string) {
  const [row] = await database
    .select({ status: keywordJobs.status })
    .from(keywordJobs)
    .where(eq(keywordJobs.id, jobId))
    .limit(1)
  if (row?.status === "cancelled") {
    throw new JobCancelledError()
  }
}

function labsMetrics(
  data: LabsKeywordData,
  sourceEndpoint: string
): DiscoveredMetrics {
  const info = data.keyword_info
  return {
    searchVolume: info?.search_volume ?? null,
    monthlySearches: info?.monthly_searches ?? null,
    cpc: info?.cpc ?? null,
    competition: info?.competition ?? null,
    competitionLevel: info?.competition_level ?? null,
    lowTopOfPageBid: info?.low_top_of_page_bid ?? null,
    highTopOfPageBid: info?.high_top_of_page_bid ?? null,
    keywordDifficulty: data.keyword_properties?.keyword_difficulty ?? null,
    intent: data.search_intent_info?.main_intent
      ? parseSearchIntent(data.search_intent_info.main_intent)
      : null,
    secondaryIntents: data.search_intent_info?.foreign_intent ?? null,
    serpFeatures: data.serp_info?.serp_item_types ?? null,
    sourceEndpoint,
  }
}

async function discoverSeedKeywords(
  database: CustomShellDb,
  job: KeywordJob,
  project: Project,
  context: ApiCallContext,
  input: SeedJobInput
): Promise<DiscoveredKeyword[]> {
  const discovered: DiscoveredKeyword[] = []
  const perSeedLimit = Math.max(
    10,
    Math.floor(input.limit / input.seedKeywords.length)
  )

  for (const [index, seed] of input.seedKeywords.entries()) {
    await setStep(
      database,
      job.id,
      5 + Math.round((30 * index) / input.seedKeywords.length),
      `Finding ideas for "${seed}"`
    )

    const response = await dataForSeoPost<{
      items: Array<LabsKeywordData & { keyword: string }> | null
    }>(
      "/v3/dataforseo_labs/google/keyword_suggestions/live",
      [
        {
          keyword: seed,
          location_code: project.locationCode,
          language_code: project.languageCode,
          limit: perSeedLimit,
          include_seed_keyword: true,
          include_serp_info: true,
        },
      ],
      { ...context, endpointName: "keyword_suggestions", keywordCount: 1 },
      database
    )
    for (const result of collectTaskResults(response).results) {
      for (const item of result.items ?? []) {
        if (!item.keyword) continue
        discovered.push({
          keyword: item.keyword,
          metrics: labsMetrics(item, "dataforseo_labs/keyword_suggestions"),
          sourceDetails: { seedKeyword: seed },
        })
      }
    }

    if (input.includeRelated) {
      const relatedResponse = await dataForSeoPost<{
        items: Array<{ keyword_data: LabsKeywordData | null }> | null
      }>(
        "/v3/dataforseo_labs/google/related_keywords/live",
        [
          {
            keyword: seed,
            location_code: project.locationCode,
            language_code: project.languageCode,
            limit: Math.min(perSeedLimit, 1000),
            include_serp_info: true,
          },
        ],
        { ...context, endpointName: "related_keywords", keywordCount: 1 },
        database
      )
      for (const result of collectTaskResults(relatedResponse).results) {
        for (const item of result.items ?? []) {
          const data = item.keyword_data
          if (!data?.keyword) continue
          discovered.push({
            keyword: data.keyword,
            metrics: labsMetrics(data, "dataforseo_labs/related_keywords"),
            sourceDetails: { seedKeyword: seed, related: true },
          })
        }
      }
    }
  }

  return discovered.slice(0, input.limit)
}

async function discoverDomainKeywords(
  database: CustomShellDb,
  job: KeywordJob,
  project: Project,
  context: ApiCallContext,
  input: DomainJobInput
): Promise<DiscoveredKeyword[]> {
  await setStep(database, job.id, 10, `Finding keywords for ${input.domain}`)

  const response = await dataForSeoPost<{
    items: Array<LabsKeywordData & { keyword: string }> | null
  }>(
    "/v3/dataforseo_labs/google/keywords_for_site/live",
    [
      {
        target: input.domain,
        location_code: project.locationCode,
        language_code: project.languageCode,
        limit: input.limit,
        include_serp_info: true,
      },
    ],
    { ...context, endpointName: "keywords_for_site" },
    database
  )

  const discovered: DiscoveredKeyword[] = []
  for (const result of collectTaskResults(response).results) {
    for (const item of result.items ?? []) {
      if (!item.keyword) continue
      discovered.push({
        keyword: item.keyword,
        metrics: labsMetrics(item, "dataforseo_labs/keywords_for_site"),
        sourceDetails: { sourceDomain: input.domain },
      })
    }
  }
  return discovered.slice(0, input.limit)
}

async function discoverCompetitorGapKeywords(
  database: CustomShellDb,
  job: KeywordJob,
  project: Project,
  context: ApiCallContext,
  input: CompetitorGapJobInput
): Promise<DiscoveredKeyword[]> {
  await setStep(
    database,
    job.id,
    10,
    `Comparing ${project.normalizedDomain} with ${input.competitorDomain}`
  )

  type SerpElement = {
    rank_absolute?: number | null
    url?: string | null
  }
  const response = await dataForSeoPost<{
    items: Array<{
      keyword_data: LabsKeywordData | null
      first_domain_serp_element: SerpElement | null
      second_domain_serp_element: SerpElement | null
    }> | null
  }>(
    "/v3/dataforseo_labs/google/domain_intersection/live",
    [
      {
        target1: input.competitorDomain,
        target2: project.normalizedDomain,
        location_code: project.locationCode,
        language_code: project.languageCode,
        intersections: false,
        limit: input.limit,
        include_serp_info: true,
      },
    ],
    { ...context, endpointName: "domain_intersection" },
    database
  )

  const discovered: DiscoveredKeyword[] = []
  for (const result of collectTaskResults(response).results) {
    for (const item of result.items ?? []) {
      const data = item.keyword_data
      if (!data?.keyword) continue
      const metrics = labsMetrics(data, "dataforseo_labs/domain_intersection")
      const competitorRank = item.first_domain_serp_element?.rank_absolute ?? null
      const ourRank = item.second_domain_serp_element?.rank_absolute ?? null
      discovered.push({
        keyword: data.keyword,
        metrics,
        sourceDetails: {
          competitorDomain: input.competitorDomain,
          competitorUrl: item.first_domain_serp_element?.url ?? null,
          competitorRank,
          ourRank,
          suggestedAction: suggestGapAction({
            intent: metrics.intent ?? "unknown",
            keywordDifficulty: metrics.keywordDifficulty ?? null,
            searchVolume: metrics.searchVolume ?? null,
            ourRank,
            competitorRank,
          }),
        },
      })
    }
  }
  return discovered.slice(0, input.limit)
}

function dedupeDiscovered(discovered: DiscoveredKeyword[]) {
  const seen = new Map<string, DiscoveredKeyword>()
  for (const item of discovered) {
    const normalized = normalizeKeyword(item.keyword)
    if (!normalized || normalized.length > 255) continue
    if (!seen.has(normalized)) {
      seen.set(normalized, item)
    }
  }
  return [...seen.entries()].map(([normalized, item]) => ({
    ...item,
    normalized,
  }))
}

async function upsertDiscoveredKeywords(
  database: CustomShellDb,
  project: Project,
  discovered: Array<DiscoveredKeyword & { normalized: string }>,
  source: string
) {
  const keywordIds = new Map<string, string>()

  for (const batch of chunk(discovered, 500)) {
    await database
      .insert(keywords)
      .values(
        batch.map((item) => ({
          keyword: item.keyword,
          normalizedKeyword: item.normalized,
          locationCode: project.locationCode,
          languageCode: project.languageCode,
        }))
      )
      .onConflictDoNothing()

    const rows = await database
      .select({ id: keywords.id, normalizedKeyword: keywords.normalizedKeyword })
      .from(keywords)
      .where(
        and(
          inArray(
            keywords.normalizedKeyword,
            batch.map((item) => item.normalized)
          ),
          eq(keywords.locationCode, project.locationCode),
          eq(keywords.languageCode, project.languageCode)
        )
      )
    for (const row of rows) {
      keywordIds.set(row.normalizedKeyword, row.id)
    }

    await upsertMetrics(
      database,
      batch
        .map((item) => ({
          keywordId: keywordIds.get(item.normalized),
          metrics: item.metrics,
        }))
        .filter(
          (item): item is { keywordId: string; metrics: DiscoveredMetrics } =>
            Boolean(item.keywordId)
        )
    )

    await database
      .insert(projectKeywords)
      .values(
        batch
          .filter((item) => keywordIds.has(item.normalized))
          .map((item) => ({
            projectId: project.id,
            keywordId: keywordIds.get(item.normalized)!,
            source,
            sourceDetails: item.sourceDetails ?? null,
          }))
      )
      .onConflictDoNothing()
  }

  return [...keywordIds.values()]
}

async function upsertMetrics(
  database: CustomShellDb,
  items: Array<{ keywordId: string; metrics: DiscoveredMetrics }>
) {
  if (!items.length) return

  for (const batch of chunk(items, 200)) {
    await database
      .insert(keywordMetrics)
      .values(
        batch.map(({ keywordId, metrics }) => ({
          keywordId,
          sourceEndpoint: metrics.sourceEndpoint,
          searchVolume: metrics.searchVolume ?? null,
          monthlySearches: metrics.monthlySearches ?? null,
          cpc: metrics.cpc != null ? String(metrics.cpc) : null,
          competition:
            metrics.competition != null ? String(metrics.competition) : null,
          competitionLevel: metrics.competitionLevel ?? null,
          lowTopOfPageBid:
            metrics.lowTopOfPageBid != null
              ? String(metrics.lowTopOfPageBid)
              : null,
          highTopOfPageBid:
            metrics.highTopOfPageBid != null
              ? String(metrics.highTopOfPageBid)
              : null,
          keywordDifficulty: metrics.keywordDifficulty ?? null,
          intent: metrics.intent ?? null,
          intentProbability:
            metrics.intentProbability != null
              ? String(metrics.intentProbability)
              : null,
          secondaryIntents: metrics.secondaryIntents ?? null,
          trendScore: metrics.monthlySearches
            ? calculateTrendScore(metrics.monthlySearches)
            : null,
          serpFeatures: metrics.serpFeatures ?? null,
          fetchedAt: new Date(),
        }))
      )
      .onConflictDoUpdate({
        target: [keywordMetrics.keywordId, keywordMetrics.provider],
        set: {
          sourceEndpoint: sql`excluded.source_endpoint`,
          searchVolume: sql`coalesce(excluded.search_volume, ${keywordMetrics.searchVolume})`,
          monthlySearches: sql`coalesce(excluded.monthly_searches, ${keywordMetrics.monthlySearches})`,
          cpc: sql`coalesce(excluded.cpc, ${keywordMetrics.cpc})`,
          competition: sql`coalesce(excluded.competition, ${keywordMetrics.competition})`,
          competitionLevel: sql`coalesce(excluded.competition_level, ${keywordMetrics.competitionLevel})`,
          lowTopOfPageBid: sql`coalesce(excluded.low_top_of_page_bid, ${keywordMetrics.lowTopOfPageBid})`,
          highTopOfPageBid: sql`coalesce(excluded.high_top_of_page_bid, ${keywordMetrics.highTopOfPageBid})`,
          keywordDifficulty: sql`coalesce(excluded.keyword_difficulty, ${keywordMetrics.keywordDifficulty})`,
          intent: sql`coalesce(excluded.intent, ${keywordMetrics.intent})`,
          intentProbability: sql`coalesce(excluded.intent_probability, ${keywordMetrics.intentProbability})`,
          secondaryIntents: sql`coalesce(excluded.secondary_intents, ${keywordMetrics.secondaryIntents})`,
          trendScore: sql`coalesce(excluded.trend_score, ${keywordMetrics.trendScore})`,
          serpFeatures: sql`coalesce(excluded.serp_features, ${keywordMetrics.serpFeatures})`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      })
  }
}

async function enrichKeywords(
  database: CustomShellDb,
  job: KeywordJob,
  project: Project,
  context: ApiCallContext,
  keywordIds: string[]
): Promise<string[]> {
  const errors: string[] = []
  const maxKeywords = envLimit("MAX_ENRICHMENT_KEYWORDS_PER_JOB", 10000)
  const cutoff = new Date(Date.now() - METRICS_FRESH_DAYS * 24 * 60 * 60 * 1000)

  const candidates = await database
    .select({
      id: keywords.id,
      keyword: keywords.keyword,
      missingVolume: sql<boolean>`${keywordMetrics.searchVolume} is null or ${keywordMetrics.fetchedAt} < ${cutoff}`,
      missingDifficulty: sql<boolean>`${keywordMetrics.keywordDifficulty} is null or ${keywordMetrics.fetchedAt} < ${cutoff}`,
      missingIntent: sql<boolean>`${keywordMetrics.intent} is null`,
    })
    .from(keywords)
    .leftJoin(keywordMetrics, eq(keywordMetrics.keywordId, keywords.id))
    .where(inArray(keywords.id, keywordIds.slice(0, maxKeywords)))

  const byKeyword = new Map(candidates.map((row) => [row.keyword, row]))

  const volumeTargets = candidates.filter(
    (row) => row.missingVolume && isValidAdsKeyword(row.keyword)
  )
  const difficultyTargets = candidates.filter((row) => row.missingDifficulty)
  const intentTargets = candidates.filter((row) => row.missingIntent)

  // Google Ads search volume, CPC, competition, monthly searches.
  for (const batch of chunk(volumeTargets, API_BATCH_SIZE)) {
    await assertNotCancelled(database, job.id)
    try {
      const response = await dataForSeoPost<{
        keyword: string
        search_volume: number | null
        cpc: number | null
        competition: string | null
        competition_index: number | null
        low_top_of_page_bid: number | null
        high_top_of_page_bid: number | null
        monthly_searches: MonthlySearch[] | null
      }>(
        "/v3/keywords_data/google_ads/search_volume/live",
        [
          {
            keywords: batch.map((row) => row.keyword),
            location_code: project.locationCode,
            language_code: project.languageCode,
          },
        ],
        {
          ...context,
          endpointName: "google_ads_search_volume",
          keywordCount: batch.length,
        },
        database
      )
      const updates = collectTaskResults(response)
        .results.map((item) => {
          const row = byKeyword.get(item.keyword)
          if (!row) return null
          return {
            keywordId: row.id,
            metrics: {
              searchVolume: item.search_volume,
              monthlySearches: item.monthly_searches,
              cpc: item.cpc,
              competition:
                item.competition_index != null
                  ? item.competition_index / 100
                  : null,
              competitionLevel: item.competition,
              lowTopOfPageBid: item.low_top_of_page_bid,
              highTopOfPageBid: item.high_top_of_page_bid,
              sourceEndpoint: "google_ads/search_volume",
            } satisfies DiscoveredMetrics,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item != null)
      await upsertMetrics(database, updates)
    } catch (error) {
      errors.push(
        `search_volume: ${error instanceof Error ? error.message : "failed"}`
      )
    }
  }

  // Keyword difficulty.
  for (const batch of chunk(difficultyTargets, API_BATCH_SIZE)) {
    await assertNotCancelled(database, job.id)
    try {
      const response = await dataForSeoPost<{
        items: Array<{
          keyword: string
          keyword_difficulty: number | null
        }> | null
      }>(
        "/v3/dataforseo_labs/google/bulk_keyword_difficulty/live",
        [
          {
            keywords: batch.map((row) => row.keyword),
            location_code: project.locationCode,
            language_code: project.languageCode,
          },
        ],
        {
          ...context,
          endpointName: "bulk_keyword_difficulty",
          keywordCount: batch.length,
        },
        database
      )
      const updates: Array<{ keywordId: string; metrics: DiscoveredMetrics }> =
        []
      for (const result of collectTaskResults(response).results) {
        for (const item of result.items ?? []) {
          const row = byKeyword.get(item.keyword)
          if (!row || item.keyword_difficulty == null) continue
          updates.push({
            keywordId: row.id,
            metrics: {
              keywordDifficulty: item.keyword_difficulty,
              sourceEndpoint: "dataforseo_labs/bulk_keyword_difficulty",
            },
          })
        }
      }
      await upsertMetrics(database, updates)
    } catch (error) {
      errors.push(
        `keyword_difficulty: ${error instanceof Error ? error.message : "failed"}`
      )
    }
  }

  // Search intent.
  for (const batch of chunk(intentTargets, API_BATCH_SIZE)) {
    await assertNotCancelled(database, job.id)
    try {
      const response = await dataForSeoPost<{
        items: Array<{
          keyword: string
          keyword_intent: { label: string; probability: number | null } | null
          secondary_keyword_intents: Array<{
            label: string
            probability: number | null
          }> | null
        }> | null
      }>(
        "/v3/dataforseo_labs/google/search_intent/live",
        [
          {
            keywords: batch.map((row) => row.keyword),
            language_code: project.languageCode,
          },
        ],
        {
          ...context,
          endpointName: "search_intent",
          keywordCount: batch.length,
        },
        database
      )
      const updates: Array<{ keywordId: string; metrics: DiscoveredMetrics }> =
        []
      for (const result of collectTaskResults(response).results) {
        for (const item of result.items ?? []) {
          const row = byKeyword.get(item.keyword)
          if (!row || !item.keyword_intent?.label) continue
          updates.push({
            keywordId: row.id,
            metrics: {
              intent: parseSearchIntent(item.keyword_intent.label),
              intentProbability: item.keyword_intent.probability,
              secondaryIntents: item.secondary_keyword_intents,
              sourceEndpoint: "dataforseo_labs/search_intent",
            },
          })
        }
      }
      await upsertMetrics(database, updates)
    } catch (error) {
      errors.push(
        `search_intent: ${error instanceof Error ? error.message : "failed"}`
      )
    }
  }

  return errors
}

/**
 * Checks Google organic positions for tracked keywords. One SERP request per
 * keyword, so the tracked-keyword cap (MAX_RANK_CHECK_KEYWORDS_PER_JOB,
 * default 100) is set to match the per-job DataForSEO request cap.
 */
async function runRankCheck(
  database: CustomShellDb,
  job: KeywordJob,
  project: Project,
  context: ApiCallContext
): Promise<string[]> {
  const { listTrackedKeywords, matchSerpPosition } = await import(
    "@/server/rank-tracker"
  )
  const { keywordRankings } = await import("@/server/schema")

  const normalizedDomain = project.normalizedDomain
  if (!normalizedDomain) {
    throw new Error("Set a domain in Settings → Project before checking rankings.")
  }

  const limit = envLimit("MAX_RANK_CHECK_KEYWORDS_PER_JOB", 100)
  const tracked = await listTrackedKeywords(project.id, limit, database)
  if (!tracked.length) {
    throw new Error("No tracked keywords to check.")
  }

  const errors: string[] = []
  let succeeded = 0

  for (const [index, item] of tracked.entries()) {
    await setStep(
      database,
      job.id,
      5 + Math.round((90 * index) / tracked.length),
      `Checking "${item.keyword}" (${index + 1}/${tracked.length})`
    )
    try {
      const response = await dataForSeoPost<{
        items: Array<{
          type?: string
          rank_absolute?: number | null
          domain?: string | null
          url?: string | null
          title?: string | null
        }> | null
      }>(
        "/v3/serp/google/organic/live/regular",
        [
          {
            keyword: item.keyword,
            location_code: project.locationCode,
            language_code: project.languageCode,
            depth: 100,
          },
        ],
        { ...context, endpointName: "serp_organic", keywordCount: 1 },
        database
      )

      const items = collectTaskResults(response).results.flatMap(
        (result) => result.items ?? []
      )
      const match = matchSerpPosition(items, normalizedDomain)
      await database.insert(keywordRankings).values({
        projectId: project.id,
        keywordId: item.keywordId,
        position: match.position,
        rankingUrl: match.url,
        rankingTitle: match.title,
        topResults: match.topResults,
      })
      succeeded += 1
    } catch (error) {
      errors.push(
        `"${item.keyword}": ${error instanceof Error ? error.message : "failed"}`
      )
    }
  }

  if (!succeeded && errors.length) {
    throw new Error(errors[0])
  }
  return errors
}

/**
 * Recomputes opportunity scores for every keyword in the project so scores
 * stay comparable after new keywords change the project volume/CPC ceiling.
 */
export async function scoreProjectKeywords(
  database: CustomShellDb,
  projectId: string
) {
  const rows = await database
    .select({
      id: projectKeywords.id,
      keyword: keywords.keyword,
      searchVolume: keywordMetrics.searchVolume,
      keywordDifficulty: keywordMetrics.keywordDifficulty,
      intent: keywordMetrics.intent,
      trendScore: keywordMetrics.trendScore,
      cpc: keywordMetrics.cpc,
    })
    .from(projectKeywords)
    .innerJoin(keywords, eq(projectKeywords.keywordId, keywords.id))
    .leftJoin(keywordMetrics, eq(keywordMetrics.keywordId, keywords.id))
    .where(eq(projectKeywords.projectId, projectId))

  if (!rows.length) return

  const maxProjectVolume = Math.max(
    1,
    ...rows.map((row) => row.searchVolume ?? 0)
  )
  const maxProjectCpc = Math.max(
    1,
    ...rows.map((row) => (row.cpc != null ? Number(row.cpc) : 0))
  )

  const scored = rows.map((row) => {
    const intent = parseSearchIntent(row.intent)
    const { score, explanation } = calculateOpportunityScore({
      searchVolume: row.searchVolume,
      keywordDifficulty: row.keywordDifficulty,
      intent,
      trendScore: row.trendScore,
      cpc: row.cpc != null ? Number(row.cpc) : null,
      maxProjectVolume,
      maxProjectCpc,
    })
    return {
      id: row.id,
      score,
      explanation: JSON.stringify(explanation),
      pageType: suggestPageType({ keyword: row.keyword, intent }),
    }
  })

  // One UPDATE ... FROM (VALUES ...) per chunk instead of one UPDATE per
  // keyword, so scoring a large project is a handful of round-trips.
  for (const batch of chunk(scored, 500)) {
    const tuples = batch.map(
      (row) =>
        sql`(${row.id}::text, ${row.score}::int, ${row.explanation}::jsonb, ${row.pageType}::text)`
    )
    await database.execute(sql`
      update ${projectKeywords} as pk
      set opportunity_score = v.score,
          score_explanation = v.explanation,
          suggested_page_type = v.page_type,
          updated_at = now()
      from (values ${sql.join(tuples, sql`, `)}) as v(id, score, explanation, page_type)
      where pk.id = v.id
    `)
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}
