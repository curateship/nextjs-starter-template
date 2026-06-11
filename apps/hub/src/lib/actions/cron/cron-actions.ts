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

