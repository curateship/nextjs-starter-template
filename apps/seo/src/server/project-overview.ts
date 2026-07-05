import { and, count, eq, sql } from "drizzle-orm"

import type { KeywordStatus } from "@/lib/keyword-research"
import { getUsageSummaryForUser } from "@/server/api-usage"
import { db, type CustomShellDb } from "@/server/db"
import { countClustersForProject } from "@/server/keyword-clusters"
import { listRecentJobsForProject } from "@/server/keyword-jobs"
import {
  listProjectKeywordsForUser,
  type ProjectKeywordRow,
} from "@/server/project-keywords"
import { getOwnedProject } from "@/server/seo-projects"
import { keywordRankings, keywords, projectKeywords } from "@/server/schema"

export type ProjectOverview = {
  statusCounts: Partial<Record<KeywordStatus, number>>
  totalKeywords: number
  trackedCount: number
  averagePosition: number | null
  topTenCount: number
  clusterCount: number
  scheduleFrequency: string
  scheduleLastRunAt: string | null
  usage: { totalCost: number; requestCount: number }
  topOpportunities: ProjectKeywordRow[]
  recentJobs: Array<{
    id: string
    type: string
    status: string
    progress: number
    currentStep: string | null
    errorMessage: string | null
    created_at: string
  }>
}

export async function getProjectOverviewForUser(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<ProjectOverview> {
  const project = await getOwnedProject(userId, projectId, database)

  // Latest position per tracked keyword.
  const latestPosition = sql`(
    select r.position from ${keywordRankings} r
    where r.project_id = ${projectId} and r.keyword_id = ${keywords.id}
    order by r.checked_at desc limit 1
  )`

  // These queries are independent — run them together instead of in series.
  const [statusRows, trackedStatsRows, topResult, recentJobs, clusterCount, usage] =
    await Promise.all([
      database
        .select({ status: projectKeywords.status, value: count() })
        .from(projectKeywords)
        .where(eq(projectKeywords.projectId, projectId))
        .groupBy(projectKeywords.status),
      database
        .select({
          trackedCount: count(),
          averagePosition: sql<string | null>`round(avg((${latestPosition})), 1)`,
          topTenCount: sql<number>`sum(case when (${latestPosition}) <= 10 then 1 else 0 end)::int`,
        })
        .from(projectKeywords)
        .innerJoin(keywords, eq(projectKeywords.keywordId, keywords.id))
        .where(
          and(
            eq(projectKeywords.projectId, projectId),
            sql`${projectKeywords.trackedAt} is not null`
          )
        ),
      listProjectKeywordsForUser(
        userId,
        {
          projectId,
          sort: { field: "opportunityScore", direction: "desc" },
          pagination: { page: 1, pageSize: 10 },
        },
        database
      ),
      listRecentJobsForProject(userId, projectId, database),
      countClustersForProject(projectId, database),
      getUsageSummaryForUser(userId, 30, database, projectId),
    ])

  const statusCounts: Partial<Record<KeywordStatus, number>> = {}
  let totalKeywords = 0
  for (const row of statusRows) {
    statusCounts[row.status as KeywordStatus] = row.value
    totalKeywords += row.value
  }

  const trackedStats = trackedStatsRows[0]
  const { rows: topOpportunities } = topResult

  return {
    statusCounts,
    totalKeywords,
    trackedCount: trackedStats?.trackedCount ?? 0,
    averagePosition:
      trackedStats?.averagePosition != null
        ? Number(trackedStats.averagePosition)
        : null,
    topTenCount: trackedStats?.topTenCount ?? 0,
    clusterCount,
    scheduleFrequency: project.scheduleFrequency,
    scheduleLastRunAt: project.scheduleLastRunAt
      ? project.scheduleLastRunAt.toISOString()
      : null,
    usage: { totalCost: usage.totalCost, requestCount: usage.requestCount },
    topOpportunities,
    recentJobs: recentJobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      errorMessage: job.errorMessage,
      created_at: job.createdAt.toISOString(),
    })),
  }
}
