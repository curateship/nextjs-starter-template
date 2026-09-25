import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { alias } from "drizzle-orm/pg-core"

import { db } from "@/server/db"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroAuditLogs,
  roomMemberships,
  roomMessages,
  roomReports,
  rooms,
  tasks,
  userPreferences,
} from "@/server/pomodoro/schema"
import { customShellUsers as users } from "@/server/schema"
import type {
  FocusSortColumn,
  ReportSortColumn,
  ReportStatus,
  RoomSortColumn,
  SessionSortColumn,
  TaskSortColumn,
} from "@/lib/pomodoro/admin-lists"
import type {
  REPORT_STATUS_FILTERS,
  ROOM_PHASE_FILTERS,
  ROOM_VISIBILITY_FILTERS,
  SESSION_MODE_FILTERS,
  SESSION_STATUS_FILTERS,
  TASK_STATUS_FILTERS,
} from "@/lib/pomodoro/admin-lists"

/**
 * What the operator pages under /admin read.
 *
 * Every list here is read-only except `reviewRoomReport`, which is the one
 * thing an operator changes: a report's standing. The pages browse the app's
 * own rows — focus totals, tasks, sessions, rooms, media choices — so nothing
 * in this file writes to a member's data.
 *
 * Paging is always server-side with a hard page-size ceiling, so a hand-edited
 * address cannot ask for every row in the database at once.
 */

type ListPage = { page: number; pageSize: number; direction: "asc" | "desc" }

/** Name-or-email match, used by every list that shows whose row it is. */
function matchesPerson(search: string) {
  const pattern = `%${search}%`
  return or(ilike(users.name, pattern), ilike(users.email, pattern))
}

function pageSlice({ page, pageSize }: ListPage) {
  return { limit: pageSize, offset: (page - 1) * pageSize }
}

function ordered(direction: "asc" | "desc") {
  return direction === "asc" ? asc : desc
}

// ---------------------------------------------------------------------------
// Focus data, one row per account
// ---------------------------------------------------------------------------

/**
 * Every account with its focus totals, rolled up from `daily_focus_stats`.
 *
 * Left-joined from the accounts table on purpose: an operator searching for
 * somebody who has never run a timer should find them on zero, not find an
 * empty table and wonder whether the search is broken.
 */
export async function listAdminFocusUsers(
  query: ListPage & { search: string; sort: FocusSortColumn }
) {
  const search = query.search.trim()
  const where = search ? matchesPerson(search) : undefined

  const totals = {
    focusSessions: sql<number>`coalesce(sum(${dailyFocusStats.focusSessions}), 0)::int`,
    focusSeconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::int`,
    tasksCompleted: sql<number>`coalesce(sum(${dailyFocusStats.tasksCompleted}), 0)::int`,
    lastActiveDate: sql<string | null>`max(${dailyFocusStats.localDate})`,
  }

  const { limit, offset } = pageSlice(query)
  const direction = ordered(query.direction)
  const sortColumn = {
    name: users.name,
    sessions: totals.focusSessions,
    focus: totals.focusSeconds,
    tasks: totals.tasksCompleted,
    last: totals.lastActiveDate,
  }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        ...totals,
      })
      .from(users)
      .leftJoin(dailyFocusStats, eq(dailyFocusStats.userId, users.id))
      .where(where)
      .groupBy(users.id, users.name, users.email)
      // A second, always-unique key so two accounts with equal totals keep a
      // stable order between pages instead of swapping and repeating a row.
      .orderBy(direction(sortColumn), asc(users.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(users).where(where),
  ])

  return { rows, total: totalRow?.total ?? 0 }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function listAdminTasks(
  query: ListPage & {
    search: string
    status: (typeof TASK_STATUS_FILTERS)[number]
    userId: string | null
    sort: TaskSortColumn
  }
) {
  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(tasks.title, pattern),
      ilike(users.name, pattern),
      ilike(users.email, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.status !== "all") filters.push(eq(tasks.status, query.status))
  if (query.userId) filters.push(eq(tasks.userId, query.userId))
  const where = filters.length ? and(...filters) : undefined

  const { limit, offset } = pageSlice(query)
  const direction = ordered(query.direction)
  const sortColumn = {
    title: tasks.title,
    person: users.name,
    date: tasks.plannedDate,
    status: tasks.status,
    pomodoros: tasks.pomodoroCount,
    created: tasks.createdAt,
  }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        plannedDate: tasks.plannedDate,
        pomodoroCount: tasks.pomodoroCount,
        createdAt: tasks.createdAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
      })
      .from(tasks)
      .innerJoin(users, eq(users.id, tasks.userId))
      .where(where)
      .orderBy(direction(sortColumn), asc(tasks.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(tasks)
      .innerJoin(users, eq(users.id, tasks.userId))
      .where(where),
  ])

  return { rows, total: totalRow?.total ?? 0 }
}

// ---------------------------------------------------------------------------
// Focus sessions
// ---------------------------------------------------------------------------

export async function listAdminSessions(
  query: ListPage & {
    search: string
    mode: (typeof SESSION_MODE_FILTERS)[number]
    status: (typeof SESSION_STATUS_FILTERS)[number]
    userId: string | null
    sort: SessionSortColumn
  }
) {
  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const match = matchesPerson(search)
    if (match) filters.push(match)
  }
  if (query.mode !== "all") filters.push(eq(focusSessions.mode, query.mode))
  if (query.status !== "all")
    filters.push(eq(focusSessions.status, query.status))
  if (query.userId) filters.push(eq(focusSessions.userId, query.userId))
  const where = filters.length ? and(...filters) : undefined

  const { limit, offset } = pageSlice(query)
  const direction = ordered(query.direction)
  const sortColumn = {
    person: users.name,
    mode: focusSessions.mode,
    status: focusSessions.status,
    length: focusSessions.accumulatedSeconds,
    started: focusSessions.createdAt,
  }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: focusSessions.id,
        mode: focusSessions.mode,
        status: focusSessions.status,
        plannedSeconds: focusSessions.plannedSeconds,
        accumulatedSeconds: focusSessions.accumulatedSeconds,
        createdAt: focusSessions.createdAt,
        completedAt: focusSessions.completedAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        taskTitle: tasks.title,
        roomName: rooms.name,
      })
      .from(focusSessions)
      .innerJoin(users, eq(users.id, focusSessions.userId))
      .leftJoin(tasks, eq(tasks.id, focusSessions.taskId))
      .leftJoin(rooms, eq(rooms.id, focusSessions.roomId))
      .where(where)
      .orderBy(direction(sortColumn), asc(focusSessions.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(focusSessions)
      .innerJoin(users, eq(users.id, focusSessions.userId))
      .where(where),
  ])

  return { rows, total: totalRow?.total ?? 0 }
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export async function listAdminRooms(
  query: ListPage & {
    search: string
    phase: (typeof ROOM_PHASE_FILTERS)[number]
    visibility: (typeof ROOM_VISIBILITY_FILTERS)[number]
    sort: RoomSortColumn
  }
) {
  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(rooms.name, pattern),
      ilike(rooms.slug, pattern),
      ilike(users.name, pattern),
      ilike(users.email, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.phase !== "all") filters.push(eq(rooms.phase, query.phase))
  if (query.visibility !== "all") {
    filters.push(eq(rooms.visibility, query.visibility))
  }
  const where = filters.length ? and(...filters) : undefined

  // People in the room right now: a membership row with no `left_at`. Counted
  // as a sub-select rather than a join, because joining the memberships table
  // would multiply the room row and break both the count and the paging.
  const memberCount = sql<number>`(
    select count(*)::int from ${roomMemberships}
    where ${roomMemberships.roomId} = ${rooms.id}
      and ${roomMemberships.leftAt} is null
  )`

  const { limit, offset } = pageSlice(query)
  const direction = ordered(query.direction)
  const sortColumn = {
    name: rooms.name,
    host: users.name,
    phase: rooms.phase,
    members: memberCount,
    created: rooms.createdAt,
  }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: rooms.id,
        name: rooms.name,
        slug: rooms.slug,
        visibility: rooms.visibility,
        phase: rooms.phase,
        createdAt: rooms.createdAt,
        closedAt: rooms.closedAt,
        hostName: users.name,
        hostEmail: users.email,
        memberCount,
      })
      .from(rooms)
      .innerJoin(users, eq(users.id, rooms.hostUserId))
      .where(where)
      .orderBy(direction(sortColumn), asc(rooms.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(rooms)
      .innerJoin(users, eq(users.id, rooms.hostUserId))
      .where(where),
  ])

  return { rows, total: totalRow?.total ?? 0 }
}

// ---------------------------------------------------------------------------
// Media: which scenes and loops people are actually using
// ---------------------------------------------------------------------------

export type AdminMediaUsage = {
  backgrounds: Record<string, number>
  sounds: Record<string, number>
}

/**
 * How many accounts have each scene and each loop selected right now.
 *
 * The catalogue itself is eight scenes and eight loops fixed in code
 * (`src/lib/pomodoro/background-catalog.ts` and `sound-catalog.ts`), so there
 * is nothing in a table to list. What the database does know is who picked
 * what, which is the part an operator cannot work out from the code.
 *
 * Stored values are `scene:<key>` and `curated:<key>`; an upload is
 * `media:<uuid>` and is counted under the key `media`.
 */
export async function loadAdminMediaUsage(): Promise<AdminMediaUsage> {
  const [backgroundRows, soundRows] = await Promise.all([
    db
      .select({
        value: userPreferences.selectedBackground,
        total: count(),
      })
      .from(userPreferences)
      .groupBy(userPreferences.selectedBackground),
    db
      .select({ value: userPreferences.selectedSound, total: count() })
      .from(userPreferences)
      .groupBy(userPreferences.selectedSound),
  ])

  return {
    backgrounds: tallyByKey(backgroundRows),
    sounds: tallyByKey(soundRows),
  }
}

function tallyByKey(rows: { value: string | null; total: number }[]) {
  const tally: Record<string, number> = {}
  for (const row of rows) {
    if (!row.value) continue
    const [type, key] = row.value.split(":")
    const bucket = type === "media" ? "media" : (key ?? "")
    if (!bucket) continue
    tally[bucket] = (tally[bucket] ?? 0) + row.total
  }
  return tally
}

// ---------------------------------------------------------------------------
// Room reports: the one section with actions
// ---------------------------------------------------------------------------

export async function listAdminReports(
  query: ListPage & {
    search: string
    status: (typeof REPORT_STATUS_FILTERS)[number]
    sort: ReportSortColumn
  }
) {
  // Three different people can appear on one report — whoever reported it,
  // whoever wrote the message, and whoever last decided — so the accounts
  // table is joined three times under three names. Written as sub-selects
  // first, which worked but read as though all three were the reporter.
  const reporter = alias(users, "report_reporter")
  const author = alias(users, "report_message_author")
  const reviewer = alias(users, "report_reviewer")

  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(roomReports.reason, pattern),
      ilike(rooms.name, pattern),
      ilike(reporter.name, pattern),
      ilike(reporter.email, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.status !== "all") filters.push(eq(roomReports.status, query.status))
  const where = filters.length ? and(...filters) : undefined

  const { limit, offset } = pageSlice(query)
  const direction = ordered(query.direction)
  const sortColumn = {
    room: rooms.name,
    reporter: reporter.name,
    // Pending first when sorting ascending: the queue an operator opens the
    // page to work through, rather than alphabetical order by accident.
    status: sql`case ${roomReports.status}
      when 'pending' then 0 when 'resolved' then 1 else 2 end`,
    created: roomReports.createdAt,
  }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: roomReports.id,
        reason: roomReports.reason,
        status: roomReports.status,
        createdAt: roomReports.createdAt,
        reviewedAt: roomReports.reviewedAt,
        roomId: rooms.id,
        roomName: rooms.name,
        reporterName: reporter.name,
        reporterEmail: reporter.email,
        messageBody: roomMessages.body,
        messageDeletedAt: roomMessages.deletedAt,
        messageAuthorName: author.name,
        reviewerName: reviewer.name,
      })
      .from(roomReports)
      .innerJoin(rooms, eq(rooms.id, roomReports.roomId))
      .innerJoin(reporter, eq(reporter.id, roomReports.reporterUserId))
      .leftJoin(roomMessages, eq(roomMessages.id, roomReports.messageId))
      .leftJoin(author, eq(author.id, roomMessages.userId))
      .leftJoin(reviewer, eq(reviewer.id, roomReports.reviewedByUserId))
      .where(where)
      .orderBy(direction(sortColumn), asc(roomReports.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(roomReports)
      .innerJoin(rooms, eq(rooms.id, roomReports.roomId))
      .innerJoin(reporter, eq(reporter.id, roomReports.reporterUserId))
      .where(where),
  ])

  return { rows, total: totalRow?.total ?? 0 }
}

/**
 * Move a report to pending, resolved or dismissed.
 *
 * Reopening clears the reviewer, because the last decision no longer stands
 * and leaving a name on it would say somebody signed off on the open report.
 * The audit row is written in the same transaction as the change, so the log
 * can never disagree with the report's standing.
 */
export async function reviewRoomReport({
  reportId,
  decision,
  actorUserId,
}: {
  reportId: string
  decision: ReportStatus
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const reopening = decision === "pending"
    const updated = await tx
      .update(roomReports)
      .set({
        status: decision,
        reviewedByUserId: reopening ? null : actorUserId,
        reviewedAt: reopening ? null : new Date(),
      })
      .where(eq(roomReports.id, reportId))
      .returning({ id: roomReports.id })

    if (!updated.length) throw new Error("REPORT_NOT_FOUND")

    await tx.insert(pomodoroAuditLogs).values({
      actorUserId,
      action: `review_report_${decision}`,
      resource: "reports",
      recordIds: [reportId],
    })

    return { id: reportId, status: decision }
  })
}

/**
 * One row of each list, taken from the query rather than written out again.
 * Spelled by hand these drifted the moment a column changed, and the screen
 * carried on compiling against a shape the database had stopped returning.
 */
type RowsOf<Fn extends (...args: never[]) => Promise<{ rows: unknown[] }>> =
  Awaited<ReturnType<Fn>>["rows"][number]

export type AdminFocusRow = RowsOf<typeof listAdminFocusUsers>
export type AdminTaskRow = RowsOf<typeof listAdminTasks>
export type AdminSessionRow = RowsOf<typeof listAdminSessions>
export type AdminRoomRow = RowsOf<typeof listAdminRooms>
export type AdminReportRow = RowsOf<typeof listAdminReports>
