import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/server/db"
import { globalBoardRule } from "@/server/pomodoro/leaderboard"
import { localDateFor } from "@/server/pomodoro/productivity"
import { dailyFocusStats, pomodoroAuditLogs, pomodoroProfiles } from "@/server/pomodoro/schema"
import { customShellUsers as users } from "@/server/schema"
import { leaderboardStartDate, type LeaderboardWindow } from "@/lib/pomodoro/leaderboard-windows"

/**
 * The leaderboard in the admin (admin task 06, part 6): the global board as
 * members see it, with how many hours a day each person focused, and the
 * people an admin took off it. See `workspace/docs/leaderboard.md`.
 *
 * Taking somebody off sets `leaderboard_hidden_at`. The global board and the
 * group boards leave them out from the next read; their own opt-in is not
 * touched, so putting them back restores exactly what they chose.
 */

/** The global board shows a hundred people at most, and so does this copy. */
const BOARD_LIMIT = 100

/**
 * The global board from the window's first day, as members see it, with the
 * account ids members never get. Days are counted in UTC: each member's own
 * board starts on their own calendar day, which can be a day either side.
 */
export async function listAdminBoard(query: {
  window: LeaderboardWindow
  page: number
  pageSize: number
  now?: Date
}) {
  const start = leaderboardStartDate(query.window, localDateFor("UTC", query.now))
  const focusSeconds = sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::int`
  const offset = (query.page - 1) * query.pageSize
  const [rows, [total]] = await Promise.all([
    offset >= BOARD_LIMIT
      ? []
      : db
          .select({
            userId: pomodoroProfiles.userId,
            name: users.name,
            email: users.email,
            publicDisplayName: pomodoroProfiles.publicDisplayName,
            handle: pomodoroProfiles.handle,
            focusSessions: sql<number>`coalesce(sum(${dailyFocusStats.focusSessions}), 0)::int`,
            focusSeconds,
            // Days with a finished focus in the window, so the hours a day are
            // the hours on the days they actually focused. A real person rarely
            // passes ten; 23 a day is the pattern the column is for.
            focusDays: sql<number>`count(*) filter (where ${dailyFocusStats.focusSessions} > 0)::int`,
          })
          .from(pomodoroProfiles)
          .innerJoin(users, eq(users.id, pomodoroProfiles.userId))
          .leftJoin(
            dailyFocusStats,
            and(eq(dailyFocusStats.userId, pomodoroProfiles.userId), gte(dailyFocusStats.localDate, start))
          )
          .where(globalBoardRule())
          .groupBy(pomodoroProfiles.userId, users.name, users.email, pomodoroProfiles.publicDisplayName, pomodoroProfiles.handle)
          // The board's own order, so a place here is the place members see.
          .orderBy(desc(focusSeconds), asc(pomodoroProfiles.userId))
          .limit(Math.min(query.pageSize, BOARD_LIMIT - offset))
          .offset(offset),
    db.select({ total: count() }).from(pomodoroProfiles).where(globalBoardRule()),
  ])
  return {
    rows: rows.map((row, index) => ({ ...row, place: offset + index + 1 })),
    total: Math.min(total?.total ?? 0, BOARD_LIMIT),
    start,
  }
}

export type AdminBoardRow = Awaited<ReturnType<typeof listAdminBoard>>["rows"][number]

const hiddenBy = alias(users, "leaderboard_hidden_by")

/** Everybody an admin took off the board, most recent first. */
export async function listBoardHidden(query: { search: string; page: number; pageSize: number }) {
  const filters: SQL[] = [isNotNull(pomodoroProfiles.leaderboardHiddenAt)]
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(ilike(users.name, pattern), ilike(users.email, pattern), ilike(pomodoroProfiles.handle, pattern))
    if (match) filters.push(match)
  }
  const where = and(...filters)
  const [rows, [total]] = await Promise.all([
    db
      .select({
        userId: pomodoroProfiles.userId,
        name: users.name,
        email: users.email,
        publicDisplayName: pomodoroProfiles.publicDisplayName,
        leaderboardOptIn: pomodoroProfiles.leaderboardOptIn,
        hiddenAt: sql<Date>`${pomodoroProfiles.leaderboardHiddenAt}`,
        hiddenByName: hiddenBy.name,
      })
      .from(pomodoroProfiles)
      .innerJoin(users, eq(users.id, pomodoroProfiles.userId))
      .leftJoin(hiddenBy, eq(hiddenBy.id, pomodoroProfiles.leaderboardHiddenByUserId))
      .where(where)
      .orderBy(desc(pomodoroProfiles.leaderboardHiddenAt), asc(pomodoroProfiles.userId))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(pomodoroProfiles)
      .innerJoin(users, eq(users.id, pomodoroProfiles.userId))
      .where(where),
  ])
  return { rows, total: total?.total ?? 0 }
}

export type AdminBoardHiddenRow = Awaited<ReturnType<typeof listBoardHidden>>["rows"][number]

/**
 * Takes people off the boards, or puts them back. Only a row that actually
 * changes is written and logged; one already in the asked-for state is
 * counted as skipped. Nobody is told; the member sees a line in Settings.
 */
export async function setBoardHidden({
  userIds,
  hidden,
  actorUserId,
  now = new Date(),
}: {
  userIds: string[]
  hidden: boolean
  actorUserId: string
  now?: Date
}) {
  return db.transaction(async (tx) => {
    const changed = await tx
      .update(pomodoroProfiles)
      .set(
        hidden
          ? { leaderboardHiddenAt: now, leaderboardHiddenByUserId: actorUserId }
          : { leaderboardHiddenAt: null, leaderboardHiddenByUserId: null }
      )
      .where(
        and(
          inArray(pomodoroProfiles.userId, userIds),
          hidden ? isNull(pomodoroProfiles.leaderboardHiddenAt) : isNotNull(pomodoroProfiles.leaderboardHiddenAt)
        )
      )
      .returning({ userId: pomodoroProfiles.userId })
    const done = changed.map((row) => row.userId)
    if (done.length)
      await tx.insert(pomodoroAuditLogs).values({
        actorUserId,
        action: hidden ? "leaderboard_hide" : "leaderboard_show",
        resource: "pomodoro_profile",
        recordIds: done,
      })
    return { changed: done, skipped: userIds.filter((id) => !done.includes(id)) }
  })
}
