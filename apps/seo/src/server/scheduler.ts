import { and, eq, inArray, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import {
  createMetricsRefreshJobForUser,
  createRankCheckJobForUser,
} from "@/server/keyword-jobs"
import { keywordJobs, projects } from "@/server/schema"

export type ScheduleFrequency = "manual" | "daily" | "weekly"

const DAY_MS = 24 * 60 * 60 * 1000
const TICK_MS = 5 * 60 * 1000

export function isScheduleDue(
  frequency: string,
  lastRunAt: Date | null,
  now: Date = new Date()
): boolean {
  if (frequency !== "daily" && frequency !== "weekly") return false
  if (!lastRunAt) return true
  const interval = frequency === "daily" ? DAY_MS : 7 * DAY_MS
  return now.getTime() - lastRunAt.getTime() >= interval
}

/**
 * Creates the scheduled jobs for every due project. Best-effort: skips
 * projects with an active job, and skips entirely when DataForSEO
 * credentials are missing (scheduled jobs would only fail).
 */
export async function runDueSchedules(database: CustomShellDb = db) {
  if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
    return { started: 0, skipped: "credentials" as const }
  }

  const candidates = await database
    .select()
    .from(projects)
    .where(sql`${projects.scheduleFrequency} <> 'manual'`)

  const now = new Date()
  let started = 0

  for (const project of candidates) {
    if (!isScheduleDue(project.scheduleFrequency, project.scheduleLastRunAt, now)) {
      continue
    }

    const [activeJob] = await database
      .select({ id: keywordJobs.id })
      .from(keywordJobs)
      .where(
        and(
          eq(keywordJobs.projectId, project.id),
          inArray(keywordJobs.status, ["pending", "running"])
        )
      )
      .limit(1)
    if (activeJob) continue

    // Mark the run before creating jobs so a slow tick can't double-fire.
    await database
      .update(projects)
      .set({ scheduleLastRunAt: now, updatedAt: now })
      .where(eq(projects.id, project.id))

    try {
      await createRankCheckJobForUser(project.userId, project.id, database)
      started += 1
    } catch {
      // No tracked keywords — nothing to check.
    }
    try {
      await createMetricsRefreshJobForUser(project.userId, project.id, database)
      started += 1
    } catch {
      // No keywords yet — nothing to refresh.
    }
  }

  return { started }
}

declare global {
  var __seoSchedulerStarted: boolean | undefined
}

export function ensureSchedulerStarted() {
  if (globalThis.__seoSchedulerStarted) return
  globalThis.__seoSchedulerStarted = true

  const tick = () => {
    runDueSchedules().catch((error) => {
      console.error("Scheduled check run failed", error)
    })
  }
  tick()
  setInterval(tick, TICK_MS)
}
