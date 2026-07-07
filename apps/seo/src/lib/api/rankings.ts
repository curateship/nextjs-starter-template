import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { KeywordJobItem } from "@/lib/api/keywords"
import type {
  RankingHistoryEntry,
  RankingRow,
  RankingSortField,
  RankingTrendPoint,
} from "@/server/rank-tracker"

export type {
  RankingHistoryEntry,
  RankingRow,
  RankingSortField,
  RankingTrendPoint,
}

export function getRankingErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ranking request failed."
}

const projectIdSchema = z.object({ projectId: z.string().min(1) })

const setTrackingFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      projectKeywordIds: z.array(z.string().min(1)).min(1).max(500),
      tracked: z.boolean(),
    })
  )
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { setKeywordTracking } = await import("@/server/rank-tracker")
    return setKeywordTracking(
      user.id,
      data.projectId,
      data.projectKeywordIds,
      data.tracked
    )
  })

const listRankingsFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      q: z.string().max(255).optional(),
      sort: z
        .object({
          field: z.enum(["keyword", "position", "change", "lastChecked"]),
          direction: z.enum(["asc", "desc"]),
        })
        .optional(),
      pagination: z.object({
        page: z.number().int().min(1),
        pageSize: z.number().int().min(1).max(100),
      }),
    })
  )
  .handler(
    async ({ data }): Promise<{ rows: RankingRow[]; total: number }> => {
      const user = await requireUser()
      const { listRankingsForProject } = await import("@/server/rank-tracker")
      return listRankingsForProject(user.id, data)
    }
  )

const rankingHistoryFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({ projectKeywordId: z.string().min(1) })
  )
  .handler(
    async ({
      data,
    }): Promise<{ keyword: string; history: RankingHistoryEntry[] }> => {
      const user = await requireUser()
      const { getRankingHistoryForUser } = await import("@/server/rank-tracker")
      return getRankingHistoryForUser(
        user.id,
        data.projectId,
        data.projectKeywordId
      )
    }
  )

const rankingTrendFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      days: z.number().int().min(7).max(365).optional(),
    })
  )
  .handler(async ({ data }): Promise<{ points: RankingTrendPoint[] }> => {
    const user = await requireUser()
    const { getRankingTrendForProject } = await import("@/server/rank-tracker")
    const points = await getRankingTrendForProject(user.id, data.projectId, {
      days: data.days,
    })
    return { points }
  })

const createRankCheckJobFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<{ job: KeywordJobItem }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { createRankCheckJobForUser } = await import("@/server/keyword-jobs")
    const job = await createRankCheckJobForUser(user.id, data.projectId)
    return {
      job: {
        id: job.id,
        type: job.type as KeywordJobItem["type"],
        status: job.status as KeywordJobItem["status"],
        progress: job.progress,
        currentStep: job.currentStep,
        errorMessage: job.errorMessage,
        created_at: job.createdAt.toISOString(),
      },
    }
  })

export function setKeywordTracking(
  projectId: string,
  projectKeywordIds: string[],
  tracked: boolean
) {
  return setTrackingFn({ data: { projectId, projectKeywordIds, tracked } })
}

export function listRankings(input: {
  projectId: string
  q?: string
  sort?: { field: RankingSortField; direction: "asc" | "desc" }
  pagination: { page: number; pageSize: number }
}) {
  return listRankingsFn({ data: input })
}

export function getRankingHistory(projectId: string, projectKeywordId: string) {
  return rankingHistoryFn({ data: { projectId, projectKeywordId } })
}

export function getRankingTrend(projectId: string, days?: number) {
  return rankingTrendFn({ data: { projectId, days } })
}

export function createRankCheckJob(projectId: string) {
  return createRankCheckJobFn({ data: { projectId } })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}
