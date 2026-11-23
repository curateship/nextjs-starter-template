import { and, count, eq, inArray, notInArray, sql } from "drizzle-orm"

import { db } from "@/server/db"
import {
  clearReportNoticesIfQueueEmpty,
  dropUnreadRoomNotices,
} from "@/server/pomodoro/notices"
import { localDateFor } from "@/server/pomodoro/productivity"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroAuditLogs,
  pomodoroNoticeLinks,
  pomodoroProfiles,
  pomodoroRoomRepeats,
  pomodoroTaskRepeats,
  roomMemberships,
  roomMessages,
  roomReports,
  rooms,
  tasks,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"

/**
 * What an operator can delete from the pomodoro admin pages, and what each
 * delete puts right on its way out.
 *
 * Tyler, 8 Oct 2026: the admin can delete rooms, sessions, reports, focus data
 * and tasks, one at a time or many at once. Before that every list but Room
 * reports was read-only.
 *
 * Every delete is one transaction that also writes one `pomodoro_audit_logs`
 * row naming every id that actually went, so the log can never disagree with
 * the data. A press that removed nothing writes no log row. Each takes one id
 * or many, so a row's button and the toolbar cannot drift apart, and returns
 * the ids it removed and the ids it left.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type AdminDeleteResult = { deleted: string[]; skipped: string[] }

async function logAdminAct(
  tx: Transaction,
  actorUserId: string,
  action: string,
  resource: string,
  recordIds: string[]
) {
  if (!recordIds.length) return
  await tx
    .insert(pomodoroAuditLogs)
    .values({ actorUserId, action, resource, recordIds })
}

function splitResult(asked: string[], deleted: string[]): AdminDeleteResult {
  const gone = new Set(deleted)
  return { deleted, skipped: asked.filter((id) => !gone.has(id)) }
}

/**
 * Each account's own timezone, for working out which day a finished session
 * or a ticked task counted towards. The day is not stored on the row: the
 * timer and the task list both add to `daily_focus_stats` under "today" in the
 * profile's timezone at that moment, so the same sum on the stored time finds
 * the same day. An account with no profile row counted in UTC, which is what a
 * new profile starts on.
 */
async function timezonesFor(tx: Transaction, userIds: string[]) {
  const rows = userIds.length
    ? await tx
        .select({
          userId: pomodoroProfiles.userId,
          timezone: pomodoroProfiles.timezone,
        })
        .from(pomodoroProfiles)
        .where(inArray(pomodoroProfiles.userId, userIds))
    : []
  const zones = new Map(rows.map((row) => [row.userId, row.timezone]))
  return (userId: string) => zones.get(userId) ?? "UTC"
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

/**
 * What deleting these rooms takes with it, for the confirm window. Chat,
 * memberships, bans, invites and message reports all go with the room row.
 * Sessions people ran in a room stay, without the room's name on them.
 */
export async function previewRoomDeletion(roomIds: string[]) {
  const [[messages], [reports], [inRoom]] = await Promise.all([
    db
      .select({ value: count() })
      .from(roomMessages)
      .where(inArray(roomMessages.roomId, roomIds)),
    db
      .select({ value: count() })
      .from(roomReports)
      .where(inArray(roomReports.roomId, roomIds)),
    db
      .select({ value: count() })
      .from(roomMemberships)
      .where(
        and(
          inArray(roomMemberships.roomId, roomIds),
          sql`${roomMemberships.leftAt} is null`
        )
      ),
  ])
  return {
    messages: messages?.value ?? 0,
    reports: reports?.value ?? 0,
    inRoom: inRoom?.value ?? 0,
  }
}

/**
 * Delete rooms, open or closed. People still inside are not moved out first:
 * once the room row is gone their live stream can no longer read it, and it
 * tells their screen "You are no longer in this room." The caller sends that
 * nudge after the transaction commits, through `notifyRoom`.
 *
 * Notices that would now point at nothing go first, while their links still
 * name the room: unread "it's open" and invite notices, and every mention and
 * reaction notice that quotes one of the room's messages, read or not, the
 * same as a host deleting one message. A report in a deleted room goes with
 * it, so the admins' "new reports" notices are cleared if the queue is empty.
 */
export async function deleteAdminRooms({
  roomIds,
  actorUserId,
}: {
  roomIds: string[]
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    await dropUnreadRoomNotices(tx, roomIds, [
      "followed_room",
      "room_open",
      "room_invite",
    ])
    await tx.delete(customShellNotifications).where(
      inArray(
        customShellNotifications.id,
        tx
          .select({ id: pomodoroNoticeLinks.noticeId })
          .from(pomodoroNoticeLinks)
          .innerJoin(
            roomMessages,
            eq(roomMessages.id, pomodoroNoticeLinks.messageId)
          )
          .where(inArray(roomMessages.roomId, roomIds))
      )
    )

    const removed = await tx
      .delete(rooms)
      .where(inArray(rooms.id, roomIds))
      .returning({ id: rooms.id })
    const deleted = removed.map((row) => row.id)

    await logAdminAct(tx, actorUserId, "delete_rooms", "rooms", deleted)
    if (deleted.length) await clearReportNoticesIfQueueEmpty(tx)
    return splitResult(roomIds, deleted)
  })
}

// ---------------------------------------------------------------------------
// Focus sessions
// ---------------------------------------------------------------------------

/**
 * Delete timer runs and take them back off the member's totals.
 *
 * A finished focus added one session and its seconds to that day's
 * `daily_focus_stats` row, and one to its task's count. Both are taken back
 * off here, never below zero, so History, the streak, the leaderboard and the
 * badge counters all drop to match. Subtracting rather than recounting is
 * deliberate: a day imported from guest mode has totals with no session rows
 * under them, and a recount would wipe it.
 *
 * A run that is still going is left alone. Deleting it would pull the timer
 * out from under somebody's open tab, so it is skipped and said so.
 */
export async function deleteAdminSessions({
  sessionIds,
  actorUserId,
}: {
  sessionIds: string[]
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(focusSessions)
      .where(
        and(
          inArray(focusSessions.id, sessionIds),
          notInArray(focusSessions.status, ["running", "paused"])
        )
      )
      .returning({
        id: focusSessions.id,
        userId: focusSessions.userId,
        taskId: focusSessions.taskId,
        mode: focusSessions.mode,
        status: focusSessions.status,
        accumulatedSeconds: focusSessions.accumulatedSeconds,
        completedAt: focusSessions.completedAt,
      })

    const counted = removed.filter(
      (row) =>
        row.mode === "focus" && row.status === "completed" && row.completedAt
    )
    const zoneOf = await timezonesFor(tx, [
      ...new Set(counted.map((row) => row.userId)),
    ])

    const days = new Map<
      string,
      { userId: string; localDate: string; sessions: number; seconds: number }
    >()
    const taskCounts = new Map<string, number>()
    for (const row of counted) {
      const localDate = localDateFor(zoneOf(row.userId), row.completedAt!)
      const key = `${row.userId}|${localDate}`
      const day = days.get(key) ?? {
        userId: row.userId,
        localDate,
        sessions: 0,
        seconds: 0,
      }
      day.sessions += 1
      day.seconds += row.accumulatedSeconds
      days.set(key, day)
      if (row.taskId)
        taskCounts.set(row.taskId, (taskCounts.get(row.taskId) ?? 0) + 1)
    }

    for (const day of days.values()) {
      await tx
        .update(dailyFocusStats)
        .set({
          focusSessions: sql`greatest(0, ${dailyFocusStats.focusSessions} - ${day.sessions})`,
          focusSeconds: sql`greatest(0, ${dailyFocusStats.focusSeconds} - ${day.seconds})`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(dailyFocusStats.userId, day.userId),
            eq(dailyFocusStats.localDate, day.localDate)
          )
        )
    }
    for (const [taskId, runs] of taskCounts) {
      await tx
        .update(tasks)
        .set({
          pomodoroCount: sql`greatest(0, ${tasks.pomodoroCount} - ${runs})`,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId))
    }

    const deleted = removed.map((row) => row.id)
    await logAdminAct(tx, actorUserId, "delete_sessions", "sessions", deleted)
    return splitResult(sessionIds, deleted)
  })
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * Delete tasks. Their steps and tags go with them, and a session that counted
 * towards one keeps its time and loses the link.
 *
 * A ticked task added one to "tasks done" on the day it was ticked, which is
 * taken back off. And an unfinished task carried to a new day points at its
 * copy with a bare id rather than a foreign key, so a deleted copy would leave
 * the original pointing at nothing: that pointer is cleared.
 */
export async function deleteAdminTasks({
  taskIds,
  actorUserId,
}: {
  taskIds: string[]
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(tasks)
      .where(inArray(tasks.id, taskIds))
      .returning({
        id: tasks.id,
        userId: tasks.userId,
        status: tasks.status,
        completedAt: tasks.completedAt,
      })
    const deleted = removed.map((row) => row.id)
    if (!deleted.length) return splitResult(taskIds, deleted)

    await tx
      .update(tasks)
      .set({ carriedToTaskId: null, updatedAt: new Date() })
      .where(inArray(tasks.carriedToTaskId, deleted))

    const ticked = removed.filter(
      (row) => row.status === "completed" && row.completedAt
    )
    const zoneOf = await timezonesFor(tx, [
      ...new Set(ticked.map((row) => row.userId)),
    ])
    const days = new Map<
      string,
      { userId: string; localDate: string; done: number }
    >()
    for (const row of ticked) {
      const localDate = localDateFor(zoneOf(row.userId), row.completedAt!)
      const key = `${row.userId}|${localDate}`
      const day = days.get(key) ?? { userId: row.userId, localDate, done: 0 }
      day.done += 1
      days.set(key, day)
    }
    for (const day of days.values()) {
      await tx
        .update(dailyFocusStats)
        .set({
          tasksCompleted: sql`greatest(0, ${dailyFocusStats.tasksCompleted} - ${day.done})`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(dailyFocusStats.userId, day.userId),
            eq(dailyFocusStats.localDate, day.localDate)
          )
        )
    }

    await logAdminAct(tx, actorUserId, "delete_tasks", "tasks", deleted)
    return splitResult(taskIds, deleted)
  })
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/**
 * Delete reports outright. The reporter is told nothing: only Resolve and
 * Dismiss send "Thanks, your report was reviewed." When the last waiting
 * report goes, the admins' "new reports" notices turn read, the same as when
 * the last one is resolved.
 */
export async function deleteAdminReports({
  reportIds,
  actorUserId,
}: {
  reportIds: string[]
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(roomReports)
      .where(inArray(roomReports.id, reportIds))
      .returning({ id: roomReports.id })
    const deleted = removed.map((row) => row.id)
    await logAdminAct(tx, actorUserId, "delete_reports", "reports", deleted)
    if (deleted.length) await clearReportNoticesIfQueueEmpty(tx)
    return splitResult(reportIds, deleted)
  })
}

// ---------------------------------------------------------------------------
// Focus data, one account at a time
// ---------------------------------------------------------------------------

/**
 * Wipe accounts' focus history: every finished or cancelled timer run, every
 * daily total, and every task's session count. The account, its tasks,
 * projects, rooms, profile and earned badges stay.
 *
 * A run still going is kept, for the same reason a single session delete
 * keeps it. When it finishes it starts a fresh daily total.
 *
 * `deleted` is the accounts that had anything to clear. An account that was
 * already on zero is `skipped`, so the line afterwards can say so.
 */
export async function clearAdminFocusData({
  userIds,
  actorUserId,
}: {
  userIds: string[]
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const sessions = await tx
      .delete(focusSessions)
      .where(
        and(
          inArray(focusSessions.userId, userIds),
          notInArray(focusSessions.status, ["running", "paused"])
        )
      )
      .returning({ userId: focusSessions.userId })
    const days = await tx
      .delete(dailyFocusStats)
      .where(inArray(dailyFocusStats.userId, userIds))
      .returning({ userId: dailyFocusStats.userId })
    const counts = await tx
      .update(tasks)
      .set({ pomodoroCount: 0, updatedAt: new Date() })
      .where(
        and(inArray(tasks.userId, userIds), sql`${tasks.pomodoroCount} > 0`)
      )
      .returning({ userId: tasks.userId })
    const touched = new Set(
      [...sessions, ...days, ...counts].map((row) => row.userId)
    )
    const deleted = userIds.filter((id) => touched.has(id))
    await logAdminAct(tx, actorUserId, "clear_focus_data", "focus_data", deleted)
    return splitResult(userIds, deleted)
  })
}

// ---------------------------------------------------------------------------
// Weekly rooms and repeating tasks
// ---------------------------------------------------------------------------

/**
 * Stop weekly rooms for good. The rooms a rule already booked stay, as
 * ordinary rooms with no rule behind them, so a room booked for tomorrow
 * still opens.
 */
export async function deleteAdminRoomRepeats({
  repeatIds,
  actorUserId,
}: {
  repeatIds: string[]
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(pomodoroRoomRepeats)
      .where(inArray(pomodoroRoomRepeats.id, repeatIds))
      .returning({ id: pomodoroRoomRepeats.id })
    const deleted = removed.map((row) => row.id)
    await logAdminAct(
      tx,
      actorUserId,
      "delete_room_repeats",
      "room_repeats",
      deleted
    )
    return splitResult(repeatIds, deleted)
  })
}

/**
 * Stop repeating tasks for good. Tasks a rule already made stay, with no rule
 * behind them.
 */
export async function deleteAdminTaskRepeats({
  repeatIds,
  actorUserId,
}: {
  repeatIds: string[]
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(pomodoroTaskRepeats)
      .where(inArray(pomodoroTaskRepeats.id, repeatIds))
      .returning({ id: pomodoroTaskRepeats.id })
    const deleted = removed.map((row) => row.id)
    await logAdminAct(
      tx,
      actorUserId,
      "delete_task_repeats",
      "task_repeats",
      deleted
    )
    return splitResult(repeatIds, deleted)
  })
}
