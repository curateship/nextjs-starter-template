import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { alias } from "drizzle-orm/pg-core"

import { db } from "@/server/db"
import { REPORT_REVIEWED_MESSAGE } from "@/lib/pomodoro/notices"
import {
  clearReportNoticesIfQueueEmpty,
  writeNotices,
} from "@/server/pomodoro/notices"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroAuditLogs,
  roomMemberships,
  roomMessages,
  pomodoroProfiles,
  pomodoroProjects,
  pomodoroRoomRepeats,
  pomodoroTaskRepeats,
  roomReports,
  rooms,
  tasks,
} from "@/server/pomodoro/schema"
import { customShellUsers as users } from "@/server/schema"
import type {
  FocusSortColumn,
  ReportSortColumn,
  ReportStatus,
  RoomRepeatSortColumn,
  RoomSortColumn,
  SessionSortColumn,
  TaskRepeatSortColumn,
  TaskSortColumn,
} from "@/lib/pomodoro/admin-lists"
import type {
  REPORT_STATUS_FILTERS,
  ROOM_REPEAT_STATUS_FILTERS,
  ROOM_PHASE_FILTERS,
  ROOM_VISIBILITY_FILTERS,
  SESSION_MODE_FILTERS,
  SESSION_STATUS_FILTERS,
  TASK_STATUS_FILTERS,
} from "@/lib/pomodoro/admin-lists"

/**
 * What the operator pages under /admin read.
 *
 * Every list here is read-only except `reviewRoomReports`, which moves a
 * report's standing. Themes and sounds have their own file,
 * `admin-catalog.ts`. The deletes live in `admin-deletes.ts`, apart from the
 * reads, because each one also puts right what the deleted rows fed into.
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
        featuredAt: rooms.featuredAt,
        hostUserId: rooms.hostUserId,
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
// Room reports: the one section with actions
// ---------------------------------------------------------------------------

export async function listAdminReports(
  query: ListPage & {
    search: string
    status: (typeof REPORT_STATUS_FILTERS)[number]
    sort: ReportSortColumn
    /** Only reports by or about this person (admin task 05). */
    person?: string
  }
) {
  // Three different people can appear on one report — whoever reported it,
  // whoever wrote the message, and whoever last decided — so the accounts
  // table is joined three times under three names. Written as sub-selects
  // first, which worked but read as though all three were the reporter.
  const reporter = alias(users, "report_reporter")
  const author = alias(users, "report_message_author")
  const reviewer = alias(users, "report_reviewer")
  // A profile report names whose profile it is, which is a fourth person.
  const reported = alias(users, "report_profile_owner")

  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(roomReports.reason, pattern),
      ilike(rooms.name, pattern),
      ilike(reporter.name, pattern),
      ilike(reporter.email, pattern),
      // So an operator can find every report about one person by name.
      ilike(reported.name, pattern),
      ilike(pomodoroProfiles.handle, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.status !== "all") filters.push(eq(roomReports.status, query.status))
  if (query.person) {
    const match = or(
      eq(roomReports.reporterUserId, query.person),
      eq(roomReports.profileUserId, query.person),
      eq(author.id, query.person)
    )
    if (match) filters.push(match)
  }
  const where = filters.length ? and(...filters) : undefined

  // Who the report is about: the message's writer, or the profile's owner.
  const subjectId = sql<string | null>`coalesce(${author.id}, ${roomReports.profileUserId})`
  // Admin task 05: how often that person was reported before this report,
  // and how this reporter's earlier reports went. Earlier only, so the
  // counts on an old report read as they would have on the day.
  const subjectPriorReports = sql<number>`(
    select count(*)::int from room_reports prior
    left join room_messages prior_message on prior_message.id = prior.message_id
    where coalesce(prior_message.user_id, prior.profile_user_id) = ${subjectId}
      and prior.created_at < ${roomReports.createdAt})`
  const reporterPast = (onlyDismissed: boolean) => sql<number>`(
    select count(*)::int from room_reports prior
    where prior.reporter_user_id = ${roomReports.reporterUserId}
      and prior.created_at < ${roomReports.createdAt}
      ${onlyDismissed ? sql`and prior.status = 'dismissed'` : sql``})`

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
        kind: roomReports.kind,
        reportedName: reported.name,
        reportedHandle: pomodoroProfiles.handle,
        reportedHiddenAt: pomodoroProfiles.hiddenAt,
        messageRemovedBy: roomMessages.removedBy,
        reporterUserId: roomReports.reporterUserId,
        subjectUserId: subjectId,
        subjectName: sql<string | null>`coalesce(${author.name}, ${reported.name})`,
        subjectPriorReports,
        reporterPastReports: reporterPast(false),
        reporterPastDismissed: reporterPast(true),
      })
      .from(roomReports)
      // Left joins throughout: a profile report has no room, and a report
      // from a signed-out reader has no reporter. Inner joins here dropped
      // every profile report out of the queue silently.
      .leftJoin(rooms, eq(rooms.id, roomReports.roomId))
      .leftJoin(reporter, eq(reporter.id, roomReports.reporterUserId))
      .leftJoin(reported, eq(reported.id, roomReports.profileUserId))
      .leftJoin(
        pomodoroProfiles,
        eq(pomodoroProfiles.userId, roomReports.profileUserId)
      )
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
      .leftJoin(rooms, eq(rooms.id, roomReports.roomId))
      .leftJoin(reporter, eq(reporter.id, roomReports.reporterUserId))
      .leftJoin(reported, eq(reported.id, roomReports.profileUserId))
      .leftJoin(
        pomodoroProfiles,
        eq(pomodoroProfiles.userId, roomReports.profileUserId)
      )
      .leftJoin(roomMessages, eq(roomMessages.id, roomReports.messageId))
      .leftJoin(author, eq(author.id, roomMessages.userId))
      .where(where),
  ])

  return { rows, total: totalRow?.total ?? 0 }
}

/**
 * Move one or more reports to pending, resolved or dismissed.
 *
 * Reopening clears the reviewer, because the last decision no longer stands
 * and leaving a name on it would say somebody signed off on the open report.
 * The audit row is written in the same transaction as the change, so the log
 * can never disagree with the report's standing.
 *
 * A report already at the asked-for standing is skipped rather than written
 * again, so a bulk Resolve over a mixed selection does not restamp the reviewer
 * and the date on decisions somebody else already made. `skipped` also holds
 * any id that is no longer a report at all.
 */
export async function reviewRoomReports({
  reportIds,
  decision,
  actorUserId,
}: {
  reportIds: string[]
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
      .where(
        and(
          inArray(roomReports.id, reportIds),
          ne(roomReports.status, decision)
        )
      )
      .returning({ id: roomReports.id })

    const reviewed = updated.map((row) => row.id)
    const changed = new Set(reviewed)
    const skipped = reportIds.filter((id) => !changed.has(id))

    // Nothing moved, so there is nothing to log. One audit row covers the whole
    // press, with every id that actually changed on it.
    if (reviewed.length) {
      await tx.insert(pomodoroAuditLogs).values({
        actorUserId,
        action: `review_report_${decision}`,
        resource: "reports",
        recordIds: reviewed,
      })
    }

    if (!reopening && reviewed.length) {
      // Each reporter hears once per report, however often it is reopened
      // and closed again: the stamp is set here and never cleared. One press
      // that closes several of one person's reports is one notice. The words
      // are the same for resolved and dismissed, so a reporter cannot learn
      // what happened to somebody else.
      const told = await tx
        .update(roomReports)
        .set({ reporterToldAt: new Date() })
        .where(
          and(
            inArray(roomReports.id, reviewed),
            isNull(roomReports.reporterToldAt),
            isNotNull(roomReports.reporterUserId)
          )
        )
        .returning({ reporterUserId: roomReports.reporterUserId })
      const reporters = [
        ...new Set(
          told.flatMap((row) => (row.reporterUserId ? [row.reporterUserId] : []))
        ),
      ]
      await writeNotices(
        tx,
        reporters.map((reporterUserId) => ({
          recipientUserId: reporterUserId,
          kind: "report_reviewed" as const,
          message: REPORT_REVIEWED_MESSAGE,
        }))
      )
      await clearReportNoticesIfQueueEmpty(tx)
    }

    return { reviewed, skipped }
  })
}

// ---------------------------------------------------------------------------
// The rules that keep making rooms and tasks
// ---------------------------------------------------------------------------

/**
 * Every weekly room rule. Deleting a room a rule booked does not stop next
 * week's, so the rule itself has to be reachable.
 */
export async function listAdminRoomRepeats(
  query: ListPage & {
    search: string
    status: (typeof ROOM_REPEAT_STATUS_FILTERS)[number]
    sort: RoomRepeatSortColumn
  }
) {
  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(pomodoroRoomRepeats.name, pattern),
      ilike(users.name, pattern),
      ilike(users.email, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.status === "active")
    filters.push(isNull(pomodoroRoomRepeats.cancelledAt))
  if (query.status === "cancelled")
    filters.push(isNotNull(pomodoroRoomRepeats.cancelledAt))
  const where = filters.length ? and(...filters) : undefined

  const { limit, offset } = pageSlice(query)
  const direction = ordered(query.direction)
  const sortColumn = {
    name: pomodoroRoomRepeats.name,
    host: users.name,
    next: pomodoroRoomRepeats.nextStartsAt,
    created: pomodoroRoomRepeats.createdAt,
  }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: pomodoroRoomRepeats.id,
        name: pomodoroRoomRepeats.name,
        visibility: pomodoroRoomRepeats.visibility,
        weekdays: pomodoroRoomRepeats.weekdays,
        startMinute: pomodoroRoomRepeats.startMinute,
        timezone: pomodoroRoomRepeats.timezone,
        nextStartsAt: pomodoroRoomRepeats.nextStartsAt,
        cancelledAt: pomodoroRoomRepeats.cancelledAt,
        featured: pomodoroRoomRepeats.featured,
        createdAt: pomodoroRoomRepeats.createdAt,
        hostUserId: pomodoroRoomRepeats.hostUserId,
        hostName: users.name,
        hostEmail: users.email,
      })
      .from(pomodoroRoomRepeats)
      .innerJoin(users, eq(users.id, pomodoroRoomRepeats.hostUserId))
      .where(where)
      .orderBy(direction(sortColumn), asc(pomodoroRoomRepeats.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(pomodoroRoomRepeats)
      .innerJoin(users, eq(users.id, pomodoroRoomRepeats.hostUserId))
      .where(where),
  ])

  return { rows, total: totalRow?.total ?? 0 }
}

/** Every repeating task rule, with its project's name when it has one. */
export async function listAdminTaskRepeats(
  query: ListPage & {
    search: string
    userId: string | null
    sort: TaskRepeatSortColumn
  }
) {
  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(pomodoroTaskRepeats.title, pattern),
      ilike(users.name, pattern),
      ilike(users.email, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.userId) filters.push(eq(pomodoroTaskRepeats.userId, query.userId))
  const where = filters.length ? and(...filters) : undefined

  const { limit, offset } = pageSlice(query)
  const direction = ordered(query.direction)
  const sortColumn = {
    title: pomodoroTaskRepeats.title,
    person: users.name,
    created: pomodoroTaskRepeats.createdAt,
  }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: pomodoroTaskRepeats.id,
        title: pomodoroTaskRepeats.title,
        weekdays: pomodoroTaskRepeats.weekdays,
        createdAt: pomodoroTaskRepeats.createdAt,
        projectName: pomodoroProjects.name,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
      })
      .from(pomodoroTaskRepeats)
      .innerJoin(users, eq(users.id, pomodoroTaskRepeats.userId))
      .leftJoin(
        pomodoroProjects,
        eq(pomodoroProjects.id, pomodoroTaskRepeats.projectId)
      )
      .where(where)
      .orderBy(direction(sortColumn), asc(pomodoroTaskRepeats.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(pomodoroTaskRepeats)
      .innerJoin(users, eq(users.id, pomodoroTaskRepeats.userId))
      .where(where),
  ])

  return { rows, total: totalRow?.total ?? 0 }
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
export type AdminRoomRepeatRow = RowsOf<typeof listAdminRoomRepeats>
export type AdminTaskRepeatRow = RowsOf<typeof listAdminTaskRepeats>
