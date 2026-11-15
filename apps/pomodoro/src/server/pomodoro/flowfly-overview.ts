import { and, asc, count, eq, gte, isNotNull, isNull, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/server/db"
import { listAdminBoard } from "@/server/pomodoro/admin-leaderboard"
import { countWaitingShares } from "@/server/pomodoro/admin-shared-media"
import {
  focusSessions,
  pomodoroGroups,
  pomodoroMediaUploads,
  pomodoroProfiles,
  pomodoroProjects,
  pomodoroRoomRepeats,
  pomodoroTags,
  pomodoroTaskSteps,
  pomodoroTaskTags,
  roomBans,
  roomInvites,
  roomMemberships,
  roomMessages,
  roomReports,
  rooms,
  tasks,
} from "@/server/pomodoro/schema"
import { isReal } from "@/server/pomodoro/simulated-controls"
import { readSimulatedSummary } from "@/server/pomodoro/simulated-watch"
import { customShellUsers as users } from "@/server/schema"

/**
 * What the Flowfly admin dashboard reads beyond its lists (Tyler, 13 Nov
 * 2026): the Dashboards block's counts, the Waiting on you block, and the
 * five Overview widgets. Every figure comes from a count the old pages or the
 * bell already made, read in one place so the block, the widgets and the
 * sections agree.
 */

/** A room open now: not closed, not waiting for its booked start. The chat page's own rule. */
const liveRoom = and(isNull(rooms.closedAt), sql`${rooms.phase} not in ('closed', 'scheduled')`)

/** A line a word filter held back and nobody has dealt with. */
const heldLine = and(isNotNull(roomMessages.heldAt), isNull(roomMessages.deletedAt), eq(roomMessages.broadcast, false))

/** A shared file waiting for its first check. `countWaitingShares`'s own rule. */
const waitingShare = and(
  eq(pomodoroMediaUploads.shared, true),
  isNotNull(pomodoroMediaUploads.shareWaitingSince),
  isNull(pomodoroMediaUploads.deletedAt)
)

/**
 * Each section's pill on the Dashboards block. Safety and Library count
 * what is waiting for an admin (reports to decide, shared files to approve,
 * Tyler's pick "Counts show waiting"); every other section counts its first
 * tab's rows: rooms, accounts, groups, tasks.
 */
export type FlowflyCounts = {
  rooms: number
  members: number
  safety: number
  social: number
  tasks: number
  library: number
}

export async function readFlowflyCounts(): Promise<FlowflyCounts> {
  const [[roomTotal], [accountTotal], [pending], [groupTotal], [taskTotal], shares] = await Promise.all([
    db.select({ total: count() }).from(rooms),
    db.select({ total: count() }).from(users),
    db.select({ total: count() }).from(roomReports).where(eq(roomReports.status, "pending")),
    db.select({ total: count() }).from(pomodoroGroups),
    db.select({ total: count() }).from(tasks),
    countWaitingShares(),
  ])
  return {
    rooms: roomTotal?.total ?? 0,
    members: accountTotal?.total ?? 0,
    safety: pending?.total ?? 0,
    social: groupTotal?.total ?? 0,
    tasks: taskTotal?.total ?? 0,
    library: shares,
  }
}

/** One thing waiting for an admin, oldest first, and where pressing it goes. */
export type WaitingItem = {
  kind: "report" | "share" | "held"
  id: string
  /** The room a held line was written in, which opens with its chat card. */
  roomId: string | null
  label: string
  line: string
  since: string
}

export type WaitingList = { total: number; reports: number; shares: number; held: number; items: WaitingItem[] }

/** A report's kind first, so the block's short name still says what it is. */
const REPORT_KIND_WORDS: Record<string, string> = {
  message: "Message report",
  profile: "Profile report",
  shared_file: "File report",
  copyright: "Copyright claim",
  group: "Group report",
}

/**
 * Waiting on you (Tyler's pick): reports to decide, shared files to approve
 * and held chat lines, the oldest first, at most `limit`. The counts are the
 * same the bell and the Dashboards block use.
 */
export async function readWaitingList(limit = 12): Promise<WaitingList> {
  const [reportRows, shareRows, heldRows, [reportCount], [heldCount], shareCount] = await Promise.all([
    db
      .select({ id: roomReports.id, kind: roomReports.kind, reason: roomReports.reason, at: roomReports.createdAt, room: rooms.name })
      .from(roomReports)
      .leftJoin(rooms, eq(rooms.id, roomReports.roomId))
      .where(eq(roomReports.status, "pending"))
      .orderBy(asc(roomReports.createdAt))
      .limit(limit),
    db
      .select({
        id: pomodoroMediaUploads.mediaId,
        name: pomodoroMediaUploads.name,
        purpose: pomodoroMediaUploads.purpose,
        at: pomodoroMediaUploads.shareWaitingSince,
        owner: sql<string>`coalesce(${pomodoroProfiles.publicDisplayName}, ${users.name})`,
      })
      .from(pomodoroMediaUploads)
      .innerJoin(users, eq(users.id, pomodoroMediaUploads.userId))
      .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroMediaUploads.userId))
      .where(waitingShare)
      .orderBy(asc(pomodoroMediaUploads.shareWaitingSince))
      .limit(limit),
    db
      .select({ id: roomMessages.id, roomId: roomMessages.roomId, body: roomMessages.body, at: roomMessages.heldAt, room: rooms.name })
      .from(roomMessages)
      .innerJoin(rooms, eq(rooms.id, roomMessages.roomId))
      .where(heldLine)
      .orderBy(asc(roomMessages.heldAt))
      .limit(limit),
    db.select({ total: count() }).from(roomReports).where(eq(roomReports.status, "pending")),
    db.select({ total: count() }).from(roomMessages).where(heldLine),
    countWaitingShares(),
  ])
  const items: WaitingItem[] = [
    ...reportRows.map((row) => ({
      kind: "report" as const,
      id: row.id,
      roomId: null,
      label: `${REPORT_KIND_WORDS[row.kind] ?? "Report"}${row.room ? `, ${row.room}` : ""}`,
      line: row.reason,
      since: row.at.toISOString(),
    })),
    ...shareRows.map((row) => ({
      kind: "share" as const,
      id: row.id,
      roomId: null,
      label: `Share to approve: ${row.name?.trim() || (row.purpose === "sound" ? "a sound" : "a background")}`,
      line: row.owner,
      since: (row.at ?? new Date(0)).toISOString(),
    })),
    ...heldRows.map((row) => ({
      kind: "held" as const,
      id: row.id,
      roomId: row.roomId,
      label: `Held line, ${row.room}`,
      line: row.body,
      since: (row.at ?? new Date(0)).toISOString(),
    })),
  ]
    .sort((a, b) => a.since.localeCompare(b.since))
    .slice(0, limit)
  const reports = reportCount?.total ?? 0
  const held = heldCount?.total ?? 0
  return { total: reports + shareCount + held, reports, shares: shareCount, held, items }
}

/** The start of today in UTC, the day every admin figure counts in. */
function startOfUtcDay(at: Date) {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
}

/** Focus today: focus finished since midnight UTC by real members (made-up members are left out). */
async function readFocusToday(at: Date) {
  const [row] = await db
    .select({
      seconds: sql<number>`coalesce(sum(${focusSessions.accumulatedSeconds}), 0)::int`,
      sessions: sql<number>`count(*)::int`,
      people: sql<number>`count(distinct ${focusSessions.userId})::int`,
    })
    .from(focusSessions)
    .where(
      and(
        eq(focusSessions.mode, "focus"),
        eq(focusSessions.status, "completed"),
        gte(focusSessions.completedAt, startOfUtcDay(at)),
        isReal(focusSessions.userId)
      )
    )
  return { seconds: row?.seconds ?? 0, sessions: row?.sessions ?? 0, people: row?.people ?? 0 }
}

/** Rooms live now: how many are open, how many people are in them, the held lines, and the busiest three. */
async function readRoomsLive() {
  // People in each room now, as a grouped sub-select joined back. A hand-made
  // correlated count in a one-table select loses its table names in drizzle
  // and quietly counts the wrong rows.
  const inRoom = db
    .select({ roomId: roomMemberships.roomId, people: sql<number>`count(*)::int`.as("people") })
    .from(roomMemberships)
    .where(isNull(roomMemberships.leftAt))
    .groupBy(roomMemberships.roomId)
    .as("in_room")
  const people = sql<number>`coalesce(${inRoom.people}, 0)::int`
  const [[open], [inside], [held], busiest] = await Promise.all([
    db.select({ total: count() }).from(rooms).where(liveRoom),
    db
      .select({ total: count() })
      .from(roomMemberships)
      .innerJoin(rooms, eq(rooms.id, roomMemberships.roomId))
      .where(and(liveRoom, isNull(roomMemberships.leftAt))),
    db.select({ total: count() }).from(roomMessages).where(heldLine),
    db
      .select({ id: rooms.id, name: rooms.name, people })
      .from(rooms)
      .leftJoin(inRoom, eq(inRoom.roomId, rooms.id))
      .where(liveRoom)
      .orderBy(sql`${people} desc`, asc(rooms.name))
      .limit(5),
  ])
  return { open: open?.total ?? 0, people: inside?.total ?? 0, held: held?.total ?? 0, busiest }
}

export async function readFlowflyOverview(at = new Date()) {
  const [focusToday, waiting, roomsLive, madeUp, board] = await Promise.all([
    readFocusToday(at),
    readWaitingList(5),
    readRoomsLive(),
    readSimulatedSummary(at),
    listAdminBoard({ window: "week", page: 1, pageSize: 5, realOnly: true, now: at }),
  ])
  return {
    focusToday,
    waiting,
    roomsLive,
    madeUp: {
      total: madeUp.total,
      focusedToday: madeUp.focusedToday,
      linesToday: madeUp.linesToday,
      centsToday: madeUp.centsToday,
      capCents: madeUp.capCents,
      roomsOpen: madeUp.roomsOpen,
      paused: madeUp.pausedAll,
    },
    topFocusers: board.rows.map((row) => ({ userId: row.userId, name: row.name, seconds: row.focusSeconds })),
  }
}

export type FlowflyOverview = Awaited<ReturnType<typeof readFlowflyOverview>>

/**
 * One task for its record on the Flowfly dashboard's right panel (Tyler's
 * pick "Task and session records"): its steps, tags, due date, project and
 * the timer runs counted on it, newest first. Admins read; nothing here
 * changes the task, which stays the member's to word.
 */
export async function readAdminTaskRecord(taskId: string) {
  const [[task], steps, tags, runs] = await Promise.all([
    db
      .select({
        id: tasks.id,
        dueDate: tasks.dueDate,
        priority: tasks.priority,
        estimated: tasks.estimatedPomodoros,
        completedAt: tasks.completedAt,
        project: pomodoroProjects.name,
      })
      .from(tasks)
      .leftJoin(pomodoroProjects, eq(pomodoroProjects.id, tasks.projectId))
      .where(eq(tasks.id, taskId))
      .limit(1),
    db
      .select({ id: pomodoroTaskSteps.id, title: pomodoroTaskSteps.title, done: pomodoroTaskSteps.done })
      .from(pomodoroTaskSteps)
      .where(eq(pomodoroTaskSteps.taskId, taskId))
      .orderBy(asc(pomodoroTaskSteps.sortOrder)),
    db
      .select({ name: pomodoroTags.name })
      .from(pomodoroTaskTags)
      .innerJoin(pomodoroTags, eq(pomodoroTags.id, pomodoroTaskTags.tagId))
      .where(eq(pomodoroTaskTags.taskId, taskId))
      .orderBy(asc(pomodoroTags.name)),
    db
      .select({
        id: focusSessions.id,
        mode: focusSessions.mode,
        status: focusSessions.status,
        seconds: focusSessions.accumulatedSeconds,
        createdAt: focusSessions.createdAt,
      })
      .from(focusSessions)
      .where(eq(focusSessions.taskId, taskId))
      .orderBy(sql`${focusSessions.createdAt} desc`)
      .limit(20),
  ])
  if (!task) return null
  return {
    dueDate: task.dueDate,
    priority: task.priority,
    estimated: task.estimated,
    completedAt: task.completedAt?.toISOString() ?? null,
    project: task.project,
    steps,
    tags: tags.map((tag) => tag.name),
    runs: runs.map((run) => ({ ...run, createdAt: run.createdAt.toISOString() })),
  }
}

export type AdminTaskRecord = NonNullable<Awaited<ReturnType<typeof readAdminTaskRecord>>>

/**
 * One room for its record on the Flowfly dashboard's right panel (Tyler's
 * picks "Room holds chat+reports" and "Room bans + weekly rule"): the
 * reports about it, its invitations, who is banned from it, and the weekly
 * rule that books it. Its chat is read by the chat card itself
 * (`loadPomodoroRoomChat`), which can let a held line through.
 */
export async function readAdminRoomRecord(roomId: string) {
  const reporter = alias(users, "room_record_reporter")
  const banned = alias(users, "room_record_banned")
  const [[room], reports, invites, bans] = await Promise.all([
    db
      .select({
        id: rooms.id,
        repeatId: rooms.repeatId,
        weekdays: pomodoroRoomRepeats.weekdays,
        startMinute: pomodoroRoomRepeats.startMinute,
        timezone: pomodoroRoomRepeats.timezone,
        repeatCancelledAt: pomodoroRoomRepeats.cancelledAt,
      })
      .from(rooms)
      .leftJoin(pomodoroRoomRepeats, eq(pomodoroRoomRepeats.id, rooms.repeatId))
      .where(eq(rooms.id, roomId))
      .limit(1),
    db
      .select({
        id: roomReports.id,
        kind: roomReports.kind,
        reason: roomReports.reason,
        status: roomReports.status,
        createdAt: roomReports.createdAt,
        reporterName: reporter.name,
      })
      .from(roomReports)
      .leftJoin(reporter, eq(reporter.id, roomReports.reporterUserId))
      .where(eq(roomReports.roomId, roomId))
      .orderBy(sql`${roomReports.createdAt} desc`)
      .limit(50),
    db
      .select({ id: roomInvites.id, email: roomInvites.email, status: roomInvites.status, createdAt: roomInvites.createdAt })
      .from(roomInvites)
      .where(eq(roomInvites.roomId, roomId))
      .orderBy(sql`${roomInvites.createdAt} desc`)
      .limit(100),
    db
      .select({ id: roomBans.id, userId: roomBans.userId, name: banned.name, createdAt: roomBans.createdAt })
      .from(roomBans)
      .innerJoin(banned, eq(banned.id, roomBans.userId))
      .where(eq(roomBans.roomId, roomId))
      .orderBy(sql`${roomBans.createdAt} desc`),
  ])
  if (!room) return null
  return {
    weekly: room.repeatId
      ? {
          id: room.repeatId,
          weekdays: room.weekdays ?? 0,
          startMinute: room.startMinute ?? 0,
          timezone: room.timezone ?? "UTC",
          stopped: Boolean(room.repeatCancelledAt),
        }
      : null,
    reports: reports.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    invites: invites.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    bans: bans.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  }
}

export type AdminRoomRecord = NonNullable<Awaited<ReturnType<typeof readAdminRoomRecord>>>
