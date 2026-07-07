import { and, count, desc, eq, isNull, sql } from "drizzle-orm"

import type { AlertType } from "@/lib/keyword-research"
import { db, type CustomShellDb } from "@/server/db"
import { getOwnedProject } from "@/server/seo-projects"
import { keywordRankingAlerts } from "@/server/schema"

const DEFAULT_MOVE_THRESHOLD = 5

export function getMoveThreshold() {
  const value = Number.parseInt(
    process.env.RANK_ALERT_MOVE_THRESHOLD || "",
    10
  )
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MOVE_THRESHOLD
}

export type DetectedAlert = {
  type: AlertType
  previousPosition: number | null
  newPosition: number | null
  /** Positive = improvement (moved up the SERP), matching the rankings table. */
  delta: number | null
}

/**
 * Classifies a position change into at most one alert. Precedence: lost/new
 * ranking, then top-10 crossings, then big moves of at least `threshold`
 * positions. Returns null when the change is not alert-worthy.
 */
export function detectRankingAlert(
  input: { previousPosition: number | null; newPosition: number | null },
  threshold = getMoveThreshold()
): DetectedAlert | null {
  const { previousPosition, newPosition } = input

  if (previousPosition == null && newPosition == null) return null

  const base = { previousPosition, newPosition }
  if (previousPosition == null) {
    return { ...base, type: "new_ranking", delta: null }
  }
  if (newPosition == null) {
    return { ...base, type: "lost_ranking", delta: null }
  }

  const delta = previousPosition - newPosition
  if (previousPosition > 10 && newPosition <= 10) {
    return { ...base, type: "entered_top_10", delta }
  }
  if (previousPosition <= 10 && newPosition > 10) {
    return { ...base, type: "left_top_10", delta }
  }
  if (Math.abs(delta) >= threshold) {
    return { ...base, type: delta > 0 ? "big_gain" : "big_drop", delta }
  }
  return null
}

/**
 * Detects and stores an alert for one rank-check transition. Returns the
 * created alert row, or null when the movement is not alert-worthy.
 */
export async function recordRankingAlert(
  input: {
    projectId: string
    keywordId: string
    keyword: string
    previousPosition: number | null
    newPosition: number | null
  },
  database: CustomShellDb = db
) {
  const detected = detectRankingAlert({
    previousPosition: input.previousPosition,
    newPosition: input.newPosition,
  })
  if (!detected) return null

  const [alert] = await database
    .insert(keywordRankingAlerts)
    .values({
      projectId: input.projectId,
      keywordId: input.keywordId,
      type: detected.type,
      previousPosition: detected.previousPosition,
      newPosition: detected.newPosition,
      delta: detected.delta,
      keywordSnapshot: input.keyword,
    })
    .returning()
  return alert ?? null
}

export type RankingAlertRow = {
  id: string
  keywordId: string
  keyword: string
  type: AlertType
  previousPosition: number | null
  newPosition: number | null
  delta: number | null
  readAt: string | null
  createdAt: string
}

export async function listAlertsForProject(
  userId: string,
  input: {
    projectId: string
    unreadOnly?: boolean
    pagination: { page: number; pageSize: number }
  },
  database: CustomShellDb = db
): Promise<{ rows: RankingAlertRow[]; total: number }> {
  await getOwnedProject(userId, input.projectId, database)

  const conditions = [eq(keywordRankingAlerts.projectId, input.projectId)]
  if (input.unreadOnly) {
    conditions.push(isNull(keywordRankingAlerts.readAt))
  }

  const page = Math.max(1, input.pagination.page)
  const pageSize = Math.max(1, Math.min(input.pagination.pageSize, 100))

  const [totalRow] = await database
    .select({ value: count() })
    .from(keywordRankingAlerts)
    .where(and(...conditions))

  const rows = await database
    .select()
    .from(keywordRankingAlerts)
    .where(and(...conditions))
    .orderBy(desc(keywordRankingAlerts.createdAt), desc(keywordRankingAlerts.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    total: totalRow?.value ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      keywordId: row.keywordId,
      keyword: row.keywordSnapshot,
      type: row.type as AlertType,
      previousPosition: row.previousPosition,
      newPosition: row.newPosition,
      delta: row.delta,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}

export async function countUnreadAlerts(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<number> {
  await getOwnedProject(userId, projectId, database)
  const [row] = await database
    .select({ value: count() })
    .from(keywordRankingAlerts)
    .where(
      and(
        eq(keywordRankingAlerts.projectId, projectId),
        isNull(keywordRankingAlerts.readAt)
      )
    )
  return row?.value ?? 0
}

export async function markAlertRead(
  userId: string,
  projectId: string,
  alertId: string,
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)
  const [updated] = await database
    .update(keywordRankingAlerts)
    .set({ readAt: sql`coalesce(${keywordRankingAlerts.readAt}, now())` })
    .where(
      and(
        eq(keywordRankingAlerts.id, alertId),
        eq(keywordRankingAlerts.projectId, projectId)
      )
    )
    .returning({ id: keywordRankingAlerts.id })

  if (!updated) {
    throw new Error("Alert not found")
  }
  return updated
}

export async function markAllAlertsRead(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)
  const updated = await database
    .update(keywordRankingAlerts)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(keywordRankingAlerts.projectId, projectId),
        isNull(keywordRankingAlerts.readAt)
      )
    )
    .returning({ id: keywordRankingAlerts.id })

  return { updated: updated.length }
}
