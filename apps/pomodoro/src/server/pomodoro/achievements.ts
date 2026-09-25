import { and, count, eq, gt, sql } from "drizzle-orm"

import {
  earnedAchievementIds,
  type AchievementCounters,
} from "@/lib/pomodoro/achievements"
import { db } from "@/server/db"
import { calculateFocusStreaks } from "@/server/pomodoro/productivity"
import {
  dailyFocusStats,
  pomodoroAchievements,
  rooms,
} from "@/server/pomodoro/schema"

/**
 * Awarding badges, and the counters the rules read.
 *
 * Awards happen where a number changes: a focus session completing, a room
 * being opened. There is no job that walks accounts looking for missed
 * badges, which is why `awardAchievements` is cheap enough to sit on those
 * paths and why it is safe to call more often than strictly needed.
 *
 * Nothing here decides what a badge is. The list and its rules live in
 * `@/lib/pomodoro/achievements`, so the panel and the award check can never
 * disagree.
 */

/** Every lifetime total the badge rules read, apart from the streak. */
export async function loadLifetimeTotals(userId: string) {
  const [[totals], [hosted]] = await Promise.all([
    db
      .select({
        focusSessions: sql<number>`coalesce(sum(${dailyFocusStats.focusSessions}), 0)::int`,
        focusSeconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::int`,
        tasksCompleted: sql<number>`coalesce(sum(${dailyFocusStats.tasksCompleted}), 0)::int`,
      })
      .from(dailyFocusStats)
      .where(eq(dailyFocusStats.userId, userId)),
    db
      .select({ roomsHosted: count() })
      .from(rooms)
      .where(eq(rooms.hostUserId, userId)),
  ])
  return {
    focusSessions: totals?.focusSessions ?? 0,
    focusSeconds: totals?.focusSeconds ?? 0,
    tasksCompleted: totals?.tasksCompleted ?? 0,
    roomsHosted: hosted?.roomsHosted ?? 0,
  }
}

/**
 * The longest run of days with a finished focus. The completion endpoint
 * already has this number from the focus summary and passes it in rather than
 * asking again; the panel has no summary, so it asks here.
 */
export async function loadBestStreak(userId: string, todayLocalDate: string) {
  const days = await db
    .select({ localDate: dailyFocusStats.localDate })
    .from(dailyFocusStats)
    .where(
      and(
        eq(dailyFocusStats.userId, userId),
        gt(dailyFocusStats.focusSessions, 0)
      )
    )
    .orderBy(dailyFocusStats.localDate)
  return calculateFocusStreaks(
    days.map((day) => day.localDate),
    todayLocalDate
  ).bestStreak
}

export async function loadAchievementCounters(
  userId: string,
  todayLocalDate: string
): Promise<AchievementCounters> {
  const [totals, bestStreak] = await Promise.all([
    loadLifetimeTotals(userId),
    loadBestStreak(userId, todayLocalDate),
  ])
  return { ...totals, bestStreak }
}

/**
 * Records every badge these counters have earned and answers with the ones
 * that were not already recorded.
 *
 * "Exactly once" is the unique index's job, not a read-then-write check here:
 * the insert offers every earned badge and `onConflictDoNothing` drops the
 * ones already on record, so `returning` names precisely the new ones. Two
 * tabs completing a session at the same moment therefore produce one row and
 * one toast between them.
 */
export async function awardAchievements(
  userId: string,
  counters: AchievementCounters
) {
  const earned = earnedAchievementIds(counters)
  if (!earned.length) return []
  const inserted = await db
    .insert(pomodoroAchievements)
    .values(earned.map((badgeId) => ({ userId, badgeId })))
    .onConflictDoNothing()
    .returning({ badgeId: pomodoroAchievements.badgeId })
  return inserted.map((row) => row.badgeId)
}

/** What the badges panel reads: the dated earnings plus today's counters. */
export async function loadAchievementState(
  userId: string,
  todayLocalDate: string
) {
  const [earned, counters] = await Promise.all([
    db
      .select({
        badgeId: pomodoroAchievements.badgeId,
        earnedAt: pomodoroAchievements.earnedAt,
      })
      .from(pomodoroAchievements)
      .where(eq(pomodoroAchievements.userId, userId)),
    loadAchievementCounters(userId, todayLocalDate),
  ])
  return { earned, counters }
}
