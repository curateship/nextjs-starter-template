import { and, count, desc, eq, gte, sql, type SQL } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { apiUsageLogs, keywordJobs, projects } from "@/server/schema"

export type UsageSummary = {
  days: number
  totalCost: number
  requestCount: number
  keywordCount: number
  failureCount: number
  byProject: Array<{
    projectId: string | null
    projectName: string | null
    cost: number
    requests: number
  }>
  byEndpoint: Array<{ endpoint: string; cost: number; requests: number }>
}

function sinceDate(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

export async function getUsageSummaryForUser(
  userId: string,
  days = 30,
  database: CustomShellDb = db,
  projectId?: string
): Promise<UsageSummary> {
  const since = sinceDate(days)
  const scope = and(
    eq(apiUsageLogs.userId, userId),
    gte(apiUsageLogs.createdAt, since),
    ...(projectId ? [eq(apiUsageLogs.projectId, projectId)] : [])
  )

  const [totals] = await database
    .select({
      totalCost: sql<string | null>`sum(${apiUsageLogs.cost})`,
      requestCount: count(),
      keywordCount: sql<string | null>`sum(${apiUsageLogs.keywordCount})`,
      failureCount: sql<string | null>`sum(case when ${apiUsageLogs.success} then 0 else 1 end)`,
    })
    .from(apiUsageLogs)
    .where(scope)

  const byProject = await database
    .select({
      projectId: apiUsageLogs.projectId,
      projectName: projects.name,
      cost: sql<string | null>`sum(${apiUsageLogs.cost})`,
      requests: count(),
    })
    .from(apiUsageLogs)
    .leftJoin(projects, eq(apiUsageLogs.projectId, projects.id))
    .where(scope)
    .groupBy(apiUsageLogs.projectId, projects.name)
    .orderBy(desc(sql`sum(${apiUsageLogs.cost})`))
    .limit(20)

  const byEndpoint = await database
    .select({
      endpoint: apiUsageLogs.endpoint,
      cost: sql<string | null>`sum(${apiUsageLogs.cost})`,
      requests: count(),
    })
    .from(apiUsageLogs)
    .where(scope)
    .groupBy(apiUsageLogs.endpoint)
    .orderBy(desc(sql`sum(${apiUsageLogs.cost})`))
    .limit(20)

  return {
    days,
    totalCost: Number(totals?.totalCost ?? 0),
    requestCount: totals?.requestCount ?? 0,
    keywordCount: Number(totals?.keywordCount ?? 0),
    failureCount: Number(totals?.failureCount ?? 0),
    byProject: byProject.map((row) => ({
      projectId: row.projectId,
      projectName: row.projectName,
      cost: Number(row.cost ?? 0),
      requests: row.requests,
    })),
    byEndpoint: byEndpoint.map((row) => ({
      endpoint: row.endpoint,
      cost: Number(row.cost ?? 0),
      requests: row.requests,
    })),
  }
}

export type UsageLogRow = {
  id: string
  endpoint: string
  projectName: string | null
  jobType: string | null
  keywordCount: number | null
  cost: number | null
  statusCode: number | null
  statusMessage: string | null
  success: boolean
  createdAt: string
}

export async function listUsageLogsForUser(
  userId: string,
  input: {
    projectId?: string
    endpoint?: string
    success?: boolean
    pagination: { page: number; pageSize: number }
  },
  database: CustomShellDb = db
): Promise<{ rows: UsageLogRow[]; total: number }> {
  const conditions: SQL[] = [eq(apiUsageLogs.userId, userId)]
  if (input.projectId) {
    conditions.push(eq(apiUsageLogs.projectId, input.projectId))
  }
  if (input.endpoint) {
    conditions.push(eq(apiUsageLogs.endpoint, input.endpoint))
  }
  if (input.success !== undefined) {
    conditions.push(eq(apiUsageLogs.success, input.success))
  }

  const page = Math.max(1, input.pagination.page)
  const pageSize = Math.max(1, Math.min(input.pagination.pageSize, 100))

  const [totalRow] = await database
    .select({ value: count() })
    .from(apiUsageLogs)
    .where(and(...conditions))

  const rows = await database
    .select({
      id: apiUsageLogs.id,
      endpoint: apiUsageLogs.endpoint,
      projectName: projects.name,
      jobType: keywordJobs.type,
      keywordCount: apiUsageLogs.keywordCount,
      cost: apiUsageLogs.cost,
      statusCode: apiUsageLogs.statusCode,
      statusMessage: apiUsageLogs.statusMessage,
      success: apiUsageLogs.success,
      createdAt: apiUsageLogs.createdAt,
    })
    .from(apiUsageLogs)
    .leftJoin(projects, eq(apiUsageLogs.projectId, projects.id))
    .leftJoin(keywordJobs, eq(apiUsageLogs.jobId, keywordJobs.id))
    .where(and(...conditions))
    .orderBy(desc(apiUsageLogs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    total: totalRow?.value ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      endpoint: row.endpoint,
      projectName: row.projectName,
      jobType: row.jobType,
      keywordCount: row.keywordCount,
      cost: row.cost != null ? Number(row.cost) : null,
      statusCode: row.statusCode,
      statusMessage: row.statusMessage,
      success: row.success,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}

export async function listUsageEndpointsForUser(
  userId: string,
  database: CustomShellDb = db
) {
  const rows = await database
    .selectDistinct({ endpoint: apiUsageLogs.endpoint })
    .from(apiUsageLogs)
    .where(eq(apiUsageLogs.userId, userId))
    .orderBy(apiUsageLogs.endpoint)
  return rows.map((row) => row.endpoint)
}
