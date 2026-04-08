'use server'

import { db } from '@/lib/db'
import { cronJobs, cronJobRuns } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { getAuthenticatedUser, requireSiteOwnership } from '@/lib/db/helpers'

export interface CronJob {
  id: string
  name: string
  endpoint: string
  schedule: string
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
  lastRun?: {
    status: string
    durationMs: number | null
    httpStatus: number | null
    startedAt: string
  } | null
}

export interface CronJobRun {
  id: string
  jobId: string
  status: string
  durationMs: number | null
  response: string | null
  httpStatus: number | null
  startedAt: string
}

function getCronFreshnessWindowMs(schedule: string) {
  const [minute, hour] = schedule.trim().split(/\s+/)

  if (minute?.startsWith('*/')) {
    const interval = parseInt(minute.slice(2), 10)
    if (!isNaN(interval) && interval > 0) return interval * 3 * 60 * 1000
  }

  if (/^\d+$/.test(minute || '') && hour === '*') {
    return 90 * 60 * 1000
  }

  return 15 * 60 * 1000
}

export async function getCronStatus(siteId: string): Promise<{
  data: { isRunning: boolean; enabledCount: number; totalCount: number; lastRunAt: string | null } | null
  error: string | null
}> {
  try {
    await requireSiteOwnership(siteId)

    const jobs = await db
      .select({
        enabled: cronJobs.enabled,
        schedule: cronJobs.schedule,
        lastRunAt: cronJobs.lastRunAt,
      })
      .from(cronJobs)

    const enabledJobs = jobs.filter(job => job.enabled)
    const now = Date.now()
    const isRunning = enabledJobs.some(job => {
      if (!job.lastRunAt) return false
      return now - job.lastRunAt.getTime() <= getCronFreshnessWindowMs(job.schedule)
    })
    const lastRunAt = enabledJobs
      .map(job => job.lastRunAt)
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0]

    return {
      data: {
        isRunning,
        enabledCount: enabledJobs.length,
        totalCount: jobs.length,
        lastRunAt: lastRunAt?.toISOString() ?? null,
      },
      error: null,
    }
  } catch {
    return { data: null, error: 'Failed to load cron status' }
  }
}

export async function getCronJobs(): Promise<{ data: CronJob[] | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user || user.role !== 'super_admin') return { data: null, error: 'Unauthorized' }

    const jobs = await db
      .select()
      .from(cronJobs)
      .orderBy(cronJobs.createdAt)

    const result: CronJob[] = []
    for (const job of jobs) {
      const [lastRun] = await db
        .select()
        .from(cronJobRuns)
        .where(eq(cronJobRuns.jobId, job.id))
        .orderBy(desc(cronJobRuns.startedAt))
        .limit(1)

      result.push({
        id: job.id,
        name: job.name,
        endpoint: job.endpoint,
        schedule: job.schedule,
        enabled: job.enabled,
        lastRunAt: job.lastRunAt?.toISOString() ?? null,
        nextRunAt: job.nextRunAt?.toISOString() ?? null,
        createdAt: job.createdAt.toISOString(),
        lastRun: lastRun ? {
          status: lastRun.status,
          durationMs: lastRun.durationMs,
          httpStatus: lastRun.httpStatus,
          startedAt: lastRun.startedAt.toISOString(),
        } : null,
      })
    }

    return { data: result, error: null }
  } catch {
    return { data: null, error: 'Failed to load cron jobs' }
  }
}

export async function toggleCronJob(jobId: string, enabled: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user || user.role !== 'super_admin') return { success: false, error: 'Unauthorized' }

    await db
      .update(cronJobs)
      .set({ enabled })
      .where(eq(cronJobs.id, jobId))

    return { success: true }
  } catch {
    return { success: false, error: 'Failed to update cron job' }
  }
}

export async function getCronJobRuns(jobId: string, limit = 20): Promise<{ data: CronJobRun[] | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user || user.role !== 'super_admin') return { data: null, error: 'Unauthorized' }

    const runs = await db
      .select()
      .from(cronJobRuns)
      .where(eq(cronJobRuns.jobId, jobId))
      .orderBy(desc(cronJobRuns.startedAt))
      .limit(limit)

    return {
      data: runs.map(r => ({
        id: r.id,
        jobId: r.jobId,
        status: r.status,
        durationMs: r.durationMs,
        response: r.response,
        httpStatus: r.httpStatus,
        startedAt: r.startedAt.toISOString(),
      })),
      error: null,
    }
  } catch {
    return { data: null, error: 'Failed to load run history' }
  }
}

export async function runCronJobManually(jobId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user || user.role !== 'super_admin') return { success: false, error: 'Unauthorized' }

    const [job] = await db
      .select()
      .from(cronJobs)
      .where(eq(cronJobs.id, jobId))

    if (!job) return { success: false, error: 'Job not found' }

    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) return { success: false, error: 'CRON_SECRET not configured' }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_DOMAIN || 'http://localhost:3000'
    const startTime = Date.now()

    let status = 'success'
    let httpStatus: number | null = null
    let response: string | null = null

    try {
      const res = await fetch(`${baseUrl}${job.endpoint}`, {
        headers: { Authorization: `Bearer ${cronSecret}` },
      })
      httpStatus = res.status
      response = await res.text()
      if (!res.ok) status = 'failed'
    } catch {
      status = 'failed'
      response = 'Connection failed'
    }

    const durationMs = Date.now() - startTime

    await db.insert(cronJobRuns).values({
      jobId: job.id,
      status,
      durationMs,
      httpStatus,
      response: response?.substring(0, 5000),
      startedAt: new Date(startTime),
    })

    await db
      .update(cronJobs)
      .set({ lastRunAt: new Date() })
      .where(eq(cronJobs.id, job.id))

    return { success: status === 'success' }
  } catch {
    return { success: false, error: 'Failed to run job' }
  }
}
