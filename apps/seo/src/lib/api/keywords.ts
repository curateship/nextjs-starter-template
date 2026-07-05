import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  KEYWORD_STATUSES,
  SEARCH_INTENTS,
  type KeywordJobStatus,
  type KeywordJobType,
} from "@/lib/keyword-research"
import type {
  CsvExportMode,
  KeywordFilters,
  KeywordSort,
  ProjectKeywordDetail,
  ProjectKeywordRow,
} from "@/server/project-keywords"

export type {
  KeywordFilters,
  KeywordSort,
  ProjectKeywordDetail,
  ProjectKeywordRow,
}

export type KeywordJobItem = {
  id: string
  type: KeywordJobType
  status: KeywordJobStatus
  progress: number
  currentStep: string | null
  errorMessage: string | null
  created_at: string
}

export function getKeywordErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Keyword request failed."
}

const projectIdSchema = z.object({ projectId: z.string().min(1) })

const filtersSchema = z
  .object({
    q: z.string().max(255).optional(),
    minVolume: z.number().int().min(0).optional(),
    maxDifficulty: z.number().int().min(0).max(100).optional(),
    intent: z.array(z.enum(SEARCH_INTENTS)).optional(),
    minCpc: z.number().min(0).optional(),
    maxCpc: z.number().min(0).optional(),
    competitionLevel: z.array(z.string().max(20)).optional(),
    includeWords: z.array(z.string().max(80)).max(10).optional(),
    excludeWords: z.array(z.string().max(80)).max(10).optional(),
    status: z.array(z.enum(KEYWORD_STATUSES)).optional(),
    source: z.array(z.string().max(40)).optional(),
    questionOnly: z.boolean().optional(),
    localOnly: z.boolean().optional(),
    clusterId: z.string().max(36).optional(),
  })
  .optional()

const sortSchema = z
  .object({
    field: z.enum([
      "opportunityScore",
      "searchVolume",
      "keywordDifficulty",
      "cpc",
      "trendScore",
      "createdAt",
    ]),
    direction: z.enum(["asc", "desc"]),
  })
  .optional()

function serializeJob(job: {
  id: string
  type: string
  status: string
  progress: number
  currentStep: string | null
  errorMessage: string | null
  createdAt: Date
}): KeywordJobItem {
  return {
    id: job.id,
    type: job.type as KeywordJobType,
    status: job.status as KeywordJobStatus,
    progress: job.progress,
    currentStep: job.currentStep,
    errorMessage: job.errorMessage,
    created_at: job.createdAt.toISOString(),
  }
}

const createSeedJobFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      seedKeywords: z.array(z.string().min(1).max(255)).min(1).max(20),
      limit: z.number().int().min(10).max(1000).optional(),
      includeRelated: z.boolean().optional(),
    })
  )
  .handler(async ({ data }): Promise<{ job: KeywordJobItem }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { createSeedKeywordJobForUser } = await import("@/server/keyword-jobs")
    const job = await createSeedKeywordJobForUser(user.id, data.projectId, data)
    return { job: serializeJob(job) }
  })

const createDomainJobFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      domain: z.string().min(1).max(255),
      limit: z.number().int().min(10).max(1000).optional(),
    })
  )
  .handler(async ({ data }): Promise<{ job: KeywordJobItem }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { createDomainKeywordJobForUser } = await import(
      "@/server/keyword-jobs"
    )
    const job = await createDomainKeywordJobForUser(
      user.id,
      data.projectId,
      data
    )
    return { job: serializeJob(job) }
  })

const createGapJobFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      competitorDomain: z.string().min(1).max(255),
      limit: z.number().int().min(10).max(1000).optional(),
    })
  )
  .handler(async ({ data }): Promise<{ job: KeywordJobItem }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { createCompetitorGapJobForUser } = await import(
      "@/server/keyword-jobs"
    )
    const job = await createCompetitorGapJobForUser(
      user.id,
      data.projectId,
      data
    )
    return { job: serializeJob(job) }
  })

const createMetricsRefreshJobFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<{ job: KeywordJobItem }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { createMetricsRefreshJobForUser } = await import(
      "@/server/keyword-jobs"
    )
    const job = await createMetricsRefreshJobForUser(user.id, data.projectId)
    return { job: serializeJob(job) }
  })

const listJobsFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<{ jobs: KeywordJobItem[] }> => {
    const user = await requireUser()
    const { listRecentJobsForProject } = await import("@/server/keyword-jobs")
    const jobs = await listRecentJobsForProject(user.id, data.projectId)
    return { jobs: jobs.map(serializeJob) }
  })

const retryJobFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ job: KeywordJobItem }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { retryJobForUser } = await import("@/server/keyword-jobs")
    return { job: serializeJob(await retryJobForUser(user.id, data.jobId)) }
  })

const cancelJobFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ jobId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ job: KeywordJobItem }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { cancelJobForUser } = await import("@/server/keyword-jobs")
    return { job: serializeJob(await cancelJobForUser(user.id, data.jobId)) }
  })

const listKeywordsFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      filters: filtersSchema,
      sort: sortSchema,
      pagination: z.object({
        page: z.number().int().min(1),
        pageSize: z.number().int().min(1).max(100),
      }),
    })
  )
  .handler(
    async ({ data }): Promise<{ rows: ProjectKeywordRow[]; total: number }> => {
      const user = await requireUser()
      const { listProjectKeywordsForUser } = await import(
        "@/server/project-keywords"
      )
      return listProjectKeywordsForUser(user.id, data)
    }
  )

const keywordDetailFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({ projectKeywordId: z.string().min(1) })
  )
  .handler(async ({ data }): Promise<{ detail: ProjectKeywordDetail }> => {
    const user = await requireUser()
    const { getProjectKeywordDetailForUser } = await import(
      "@/server/project-keywords"
    )
    const detail = await getProjectKeywordDetailForUser(
      user.id,
      data.projectId,
      data.projectKeywordId
    )
    return { detail }
  })

const updateStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      projectKeywordIds: z.array(z.string().min(1)).min(1).max(500),
      status: z.enum(KEYWORD_STATUSES),
    })
  )
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { updateProjectKeywordStatusForUser } = await import(
      "@/server/project-keywords"
    )
    return updateProjectKeywordStatusForUser(
      user.id,
      data.projectId,
      data.projectKeywordIds,
      data.status
    )
  })

const updatePlanFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      projectKeywordId: z.string().min(1),
      notes: z.string().max(5000).optional(),
      assignedUrl: z.string().max(2000).optional(),
      status: z.enum(KEYWORD_STATUSES).optional(),
    })
  )
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { updateProjectKeywordPlanForUser } = await import(
      "@/server/project-keywords"
    )
    const { projectId, projectKeywordId, ...fields } = data
    return updateProjectKeywordPlanForUser(
      user.id,
      projectId,
      projectKeywordId,
      fields
    )
  })

const exportCsvFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      mode: z.enum(["all", "filtered", "selected", "saved", "content_plan"]),
      filters: filtersSchema,
      selectedIds: z.array(z.string().min(1)).max(10000).optional(),
    })
  )
  .handler(async ({ data }): Promise<{ filename: string; csv: string }> => {
    const user = await requireUser()
    const { exportProjectKeywordsCsvForUser } = await import(
      "@/server/project-keywords"
    )
    return exportProjectKeywordsCsvForUser(user.id, data)
  })

export function createSeedKeywordJob(input: {
  projectId: string
  seedKeywords: string[]
  limit?: number
  includeRelated?: boolean
}) {
  return createSeedJobFn({ data: input })
}

export function createDomainKeywordJob(input: {
  projectId: string
  domain: string
  limit?: number
}) {
  return createDomainJobFn({ data: input })
}

export function createCompetitorGapJob(input: {
  projectId: string
  competitorDomain: string
  limit?: number
}) {
  return createGapJobFn({ data: input })
}

export function createMetricsRefreshJob(projectId: string) {
  return createMetricsRefreshJobFn({ data: { projectId } })
}

export function listKeywordJobs(projectId: string) {
  return listJobsFn({ data: { projectId } })
}

export function retryKeywordJob(jobId: string) {
  return retryJobFn({ data: { jobId } })
}

export function cancelKeywordJob(jobId: string) {
  return cancelJobFn({ data: { jobId } })
}

export function listProjectKeywords(input: {
  projectId: string
  filters?: KeywordFilters
  sort?: KeywordSort
  pagination: { page: number; pageSize: number }
}) {
  return listKeywordsFn({ data: input })
}

export function getKeywordDetail(projectId: string, projectKeywordId: string) {
  return keywordDetailFn({ data: { projectId, projectKeywordId } })
}

export function updateKeywordStatus(
  projectId: string,
  projectKeywordIds: string[],
  status: (typeof KEYWORD_STATUSES)[number]
) {
  return updateStatusFn({ data: { projectId, projectKeywordIds, status } })
}

export function updateKeywordPlan(input: {
  projectId: string
  projectKeywordId: string
  notes?: string
  assignedUrl?: string
  status?: (typeof KEYWORD_STATUSES)[number]
}) {
  return updatePlanFn({ data: input })
}

export function exportKeywordsCsv(input: {
  projectId: string
  mode: CsvExportMode
  filters?: KeywordFilters
  selectedIds?: string[]
}) {
  return exportCsvFn({ data: input })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}
