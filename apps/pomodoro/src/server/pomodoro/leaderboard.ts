import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm"

import { db } from "@/server/db"
import {
  dailyFocusStats,
  pomodoroGroupMembers,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"

/**
 * The one ranking query, and the one place a window becomes a date.
 *
 * The global board and a group board are the same sum over the same table,
 * differing in who is allowed in it, so there is one query with one filter
 * rather than two that can drift apart. The opt-in rules are the filter:
 *
 * - The global board needs "Show me on the leaderboard" **and** a public
 *   display name.
 * - A group board needs a public display name and membership of that group,
 *   and nothing else. Tyler's call on 29 Sep 2026: someone should be able to
 *   compete with four friends without being listed publicly.
 *
 * A name inside a group cannot reach the global board, because the global
 * filter still tests the opt-in column and a group never touches it.
 */

/** Ranked accounts are capped so no board can return an unbounded list. */
const BOARD_LIMIT = 100

export type LeaderboardRow = {
  name: string | null
  focusSessions: number
  focusSeconds: number
  /** True on the viewer's own row. The user id it was matched on stays here. */
  isYou: boolean
}

/**
 * The board from `start` onwards, newest ranking first.
 *
 * `groupId` swaps the global opt-in rule for membership of that group. The
 * caller has already proved the viewer belongs to it; this function does not
 * check, because it is not an endpoint.
 *
 * User ids never leave: the viewer's own row is marked here and the id is
 * dropped, the same rule the room snapshots follow.
 */
export async function readLeaderboardRows({
  start,
  viewerUserId,
  groupId,
}: {
  start: string
  viewerUserId: string
  groupId?: string
}): Promise<LeaderboardRow[]> {
  const whoIsListed = groupId
    ? and(
        isNotNull(pomodoroProfiles.publicDisplayName),
        inArray(
          pomodoroProfiles.userId,
          db
            .select({ userId: pomodoroGroupMembers.userId })
            .from(pomodoroGroupMembers)
            .where(eq(pomodoroGroupMembers.groupId, groupId))
        )
      )
    : and(
        eq(pomodoroProfiles.leaderboardOptIn, true),
        isNotNull(pomodoroProfiles.publicDisplayName)
      )

  const rows = await db
    .select({
      userId: pomodoroProfiles.userId,
      name: pomodoroProfiles.publicDisplayName,
      focusSessions: sql<number>`coalesce(sum(${dailyFocusStats.focusSessions}), 0)::int`,
      focusSeconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::int`,
    })
    .from(pomodoroProfiles)
    .leftJoin(
      dailyFocusStats,
      and(
        eq(dailyFocusStats.userId, pomodoroProfiles.userId),
        gte(dailyFocusStats.localDate, start)
      )
    )
    .where(whoIsListed)
    .groupBy(pomodoroProfiles.userId, pomodoroProfiles.publicDisplayName)
    .orderBy(desc(sql`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)`))
    .limit(BOARD_LIMIT)

  return rows.map(({ userId, ...leader }) => ({
    ...leader,
    isYou: userId === viewerUserId,
  }))
}
