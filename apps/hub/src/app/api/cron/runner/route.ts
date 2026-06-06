import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cronJobs, cronJobRuns } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

const CRON_RUN_RETENTION_LIMIT = 30

async function pruneCronJobRuns(jobId: string) {
  await db.execute(sql`
    delete from cron_job_runs
    where job_id = ${jobId}
      and id not in (
        select id
        from cron_job_runs
        where job_id = ${jobId}
        order by started_at desc
        limit ${CRON_RUN_RETENTION_LIMIT}
      )
  `)
}

/**
 * GET /api/cron/runner
 * Unified cron runner — checks all enabled jobs, runs any that are due.
 * This is the only endpoint that needs to be in the system crontab (runs every minute).
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_DOMAIN || 'http://localhost:3000'

  // Get enabled jobs that are due (nextRunAt <= now OR nextRunAt is null)
  const jobs = await db
    .select()
    .from(cronJobs)
    .where(eq(cronJobs.enabled, true))

  const dueJobs = jobs.filter(job => !job.nextRunAt || job.nextRunAt <= now)

  if (!dueJobs.length) {
    return NextResponse.json({ message: 'No jobs due', ran: 0 })
  }

  let ran = 0

  for (const job of dueJobs) {
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

    // Log the run
    await db.insert(cronJobRuns).values({
      jobId: job.id,
      status,
      durationMs,
      httpStatus,
      response: response?.substring(0, 5000),
      startedAt: new Date(startTime),
    })
    await pruneCronJobRuns(job.id)

    // Update job with last run time and calculate next run
    const nextRunAt = getNextRunTime(job.schedule, now)
    await db
      .update(cronJobs)
      .set({ lastRunAt: now, nextRunAt })
      .where(eq(cronJobs.id, job.id))

    ran++
  }

  return NextResponse.json({ message: `Ran ${ran} jobs`, ran })
}

/**
 * Parse a cron schedule and return the next run time after `after`.
 * Supports: "* /N * * * *" (every N minutes) and "M * * * *" (at minute M each hour)
 * For more complex schedules, falls back to 5 minutes from now.
 */
function getNextRunTime(schedule: string, after: Date): Date {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length !== 5) return new Date(after.getTime() + 5 * 60 * 1000)

  const [minute, hour] = parts

  // Every N minutes: */5
  if (minute.startsWith('*/')) {
    const interval = parseInt(minute.slice(2), 10)
    if (!isNaN(interval) && interval > 0) {
      return new Date(after.getTime() + interval * 60 * 1000)
    }
  }

  // Specific minute each hour: "0" or "30"
  if (/^\d+$/.test(minute) && hour === '*') {
    const targetMinute = parseInt(minute, 10)
    const next = new Date(after)
    next.setSeconds(0, 0)
    next.setMinutes(targetMinute)
    if (next <= after) {
      next.setHours(next.getHours() + 1)
    }
    return next
  }

  // Fallback: 5 minutes
  return new Date(after.getTime() + 5 * 60 * 1000)
}
