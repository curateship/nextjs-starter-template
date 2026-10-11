import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm"

import { planSimulatedDay, shiftDate } from "@/lib/pomodoro/simulated-days"
import type { SimulatedSort, SimulatedTab } from "@/lib/pomodoro/admin-lists"
import { db } from "@/server/db"
import { loadAppSettings } from "@/server/pomodoro/app-settings"
import { localDateFor } from "@/server/pomodoro/productivity"
import {
  pomodoroAuditLogs,
  pomodoroProfiles,
  pomodoroSimulatedAccounts,
  pomodoroSimulatedLines,
  pomodoroSimulatedRooms,
  rooms,
} from "@/server/pomodoro/schema"
import { chatSpentTodayCents, readRealPresence } from "@/server/pomodoro/simulated-controls"
import { customShellUsers as users } from "@/server/schema"

/**
 * The watch page, `/admin/pomodoro-simulated` (live activity task 05, Parts 2
 * and 3): what each made-up member did today, today's schedule before it
 * happens, and every line they said with the brief behind it. Reads only,
 * apart from the pause switch. See "Your controls" in
 * `workspace/docs/made-up-members.md`.
 *
 * "Today" is since midnight UTC for lines and cost, the day the chat cap
 * counts, and each account's own calendar day for its hours, the day its
 * profile counts.
 */

function utcMidnight(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** The parts of a row worked out in SQL, so the Today tab and the sort can use them. */
function rowFigures(now: Date) {
  const midnight = utcMidnight(now).toISOString()
  const at = now.toISOString()
  // Named in full: in a select with no join the column comes out bare, and a
  // bare "user_id" inside these subqueries would mean their own row.
  const account = sql.raw("pomodoro_simulated_accounts.user_id")
  return {
    todaySeconds: sql<number>`coalesce((
      select d.focus_seconds from daily_focus_stats d
      where d.user_id = ${account}
        and d.local_date = (${at}::timestamptz at time zone (pomodoro_simulated_accounts.habits ->> 'timezone'))::date
    ), 0)::int`,
    linesToday: sql<number>`(
      select count(*) from pomodoro_simulated_lines l
      where l.user_id = ${account} and l.message_id is not null and l.created_at >= ${midnight}::timestamptz
    )::int`,
    centsToday: sql<number>`(
      select coalesce(sum(l.cost_cents), 0) from pomodoro_simulated_lines l
      where l.user_id = ${account} and l.created_at >= ${midnight}::timestamptz
    )::float`,
    roomName: sql<string | null>`(
      select r.name from room_memberships m join rooms r on r.id = m.room_id
      where m.user_id = ${account} and m.left_at is null limit 1
    )`,
  }
}

export async function listSimulatedWatch(query: {
  tab: SimulatedTab
  search: string
  sort: SimulatedSort
  direction: "asc" | "desc"
  page: number
  pageSize: number
  now?: Date
}) {
  const now = query.now ?? new Date()
  const figures = rowFigures(now)
  const name = sql<string>`coalesce(${pomodoroProfiles.publicDisplayName}, ${users.name})`
  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(ilike(users.name, pattern), ilike(pomodoroProfiles.publicDisplayName, pattern), ilike(pomodoroProfiles.handle, pattern))
    if (match) filters.push(match)
  }
  if (query.tab === "paused") filters.push(isNotNull(pomodoroSimulatedAccounts.pausedAt))
  if (query.tab === "today")
    filters.push(sql`(${figures.todaySeconds} > 0 or ${figures.linesToday} > 0 or ${figures.roomName} is not null)`)
  const where = filters.length ? and(...filters) : undefined
  const order = query.direction === "asc" ? asc : desc
  const sortColumn = { name, hours: figures.todaySeconds, lines: figures.linesToday }[query.sort]

  const base = () =>
    db
      .select({
        userId: pomodoroSimulatedAccounts.userId,
        name,
        handle: pomodoroProfiles.handle,
        timezone: sql<string>`${pomodoroSimulatedAccounts.habits} ->> 'timezone'`,
        pausedAt: pomodoroSimulatedAccounts.pausedAt,
        ...figures,
      })
      .from(pomodoroSimulatedAccounts)
      .innerJoin(users, eq(users.id, pomodoroSimulatedAccounts.userId))
      .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroSimulatedAccounts.userId))
  const [rows, [total]] = await Promise.all([
    base()
      .where(where)
      .orderBy(order(sortColumn), asc(pomodoroSimulatedAccounts.userId))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(pomodoroSimulatedAccounts)
      .innerJoin(users, eq(users.id, pomodoroSimulatedAccounts.userId))
      .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroSimulatedAccounts.userId))
      .where(where),
  ])
  return { rows, total: total?.total ?? 0 }
}

export type SimulatedWatchRow = Awaited<ReturnType<typeof listSimulatedWatch>>["rows"][number]

/** The line across the top: "31 focused today, 4 rooms open, 212 lines for 18¢ of 50¢". */
export async function readSimulatedSummary(now = new Date()) {
  const figures = rowFigures(now)
  const settings = await loadAppSettings()
  const [[accounts], [roomsOpen], [lines], cents, presence] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        focusedToday: sql<number>`count(*) filter (where ${figures.todaySeconds} > 0)::int`,
        paused: sql<number>`count(*) filter (where ${pomodoroSimulatedAccounts.pausedAt} is not null)::int`,
      })
      .from(pomodoroSimulatedAccounts),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(pomodoroSimulatedRooms)
      .innerJoin(rooms, eq(rooms.id, pomodoroSimulatedRooms.roomId))
      .where(and(isNull(rooms.closedAt), sql`${rooms.phase} not in ('scheduled', 'closed')`)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(pomodoroSimulatedLines)
      .where(and(isNotNull(pomodoroSimulatedLines.messageId), sql`${pomodoroSimulatedLines.createdAt} >= ${utcMidnight(now).toISOString()}::timestamptz`)),
    chatSpentTodayCents(now),
    readRealPresence(now),
  ])
  return {
    total: accounts?.total ?? 0,
    focusedToday: accounts?.focusedToday ?? 0,
    paused: accounts?.paused ?? 0,
    roomsOpen: roomsOpen?.total ?? 0,
    linesToday: lines?.total ?? 0,
    centsToday: cents,
    capCents: settings["simulated.chatCap"].centsPerDay,
    lastRealSeenAt: presence.lastSeenAt?.toISOString() ?? null,
    switches: settings["simulated.switches"],
    pausedAll: settings["simulated.accounts"].paused,
  }
}

export type SimulatedSummary = Awaited<ReturnType<typeof readSimulatedSummary>>

/** Every line, newest first, with the brief that made it, so a bad line is traced to its setting. */
export async function listSimulatedLines(query: { page: number; pageSize: number }) {
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: pomodoroSimulatedLines.id,
        createdAt: pomodoroSimulatedLines.createdAt,
        userId: pomodoroSimulatedLines.userId,
        name: sql<string>`coalesce(${pomodoroProfiles.publicDisplayName}, ${users.name})`,
        roomName: rooms.name,
        kind: pomodoroSimulatedLines.kind,
        source: pomodoroSimulatedLines.source,
        model: pomodoroSimulatedLines.model,
        costCents: pomodoroSimulatedLines.costCents,
        body: pomodoroSimulatedLines.body,
        sent: sql<boolean>`${pomodoroSimulatedLines.messageId} is not null`,
        rejectedReason: pomodoroSimulatedLines.rejectedReason,
        brief: pomodoroSimulatedLines.brief,
      })
      .from(pomodoroSimulatedLines)
      .innerJoin(users, eq(users.id, pomodoroSimulatedLines.userId))
      .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroSimulatedLines.userId))
      .leftJoin(rooms, eq(rooms.id, pomodoroSimulatedLines.roomId))
      .orderBy(desc(pomodoroSimulatedLines.createdAt), desc(pomodoroSimulatedLines.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(pomodoroSimulatedLines),
  ])
  return { rows: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), total: total?.total ?? 0 }
}

export type SimulatedLineRow = Awaited<ReturnType<typeof listSimulatedLines>>["rows"][number]

export type ScheduleHour = {
  /** The hour's start, as an instant; the browser shows it in the admin's own time. */
  startsAt: string
  /** Made-up members due to start a focus in this hour, each once. */
  focusing: { userId: string; name: string }[]
  /** Rooms due to open in this hour: a host's day-start room, or a weekly booking. */
  rooms: { name: string; host: string; weekly: boolean }[]
}

const HOUR_MS = 60 * 60_000

/**
 * The next 24 hours by hour, read from the habits before any of it runs
 * (Part 3): who starts a focus in each hour by their own day plan, and which
 * rooms open, a host's room at the start of its working day and the weekly
 * bookings. Nothing is written. Paused accounts and those Remove all left
 * are not in it. Rooms opened to keep the list full depend on the moment and
 * are not foreseen.
 */
export async function readTodaySchedule(now = new Date()): Promise<ScheduleHour[]> {
  const { hoursCap } = (await loadAppSettings())["simulated.accounts"]
  const first = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS
  const end = first + 24 * HOUR_MS
  const hours: ScheduleHour[] = Array.from({ length: 24 }, (_, index) => ({
    startsAt: new Date(first + index * HOUR_MS).toISOString(),
    focusing: [],
    rooms: [],
  }))
  const slot = (at: number) => (at >= first && at < end ? hours[Math.floor((at - first) / HOUR_MS)] : null)

  const [accounts, booked] = await Promise.all([
    db
      .select({
        userId: pomodoroSimulatedAccounts.userId,
        habits: pomodoroSimulatedAccounts.habits,
        name: sql<string>`coalesce(${pomodoroProfiles.publicDisplayName}, ${users.name})`,
      })
      .from(pomodoroSimulatedAccounts)
      .innerJoin(users, eq(users.id, pomodoroSimulatedAccounts.userId))
      .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroSimulatedAccounts.userId))
      .where(and(isNull(pomodoroSimulatedAccounts.pausedAt), isNull(pomodoroSimulatedAccounts.removeRequestedAt))),
    db
      .select({ name: rooms.name, startsAt: rooms.startsAt, hostUserId: rooms.hostUserId })
      .from(rooms)
      .where(
        and(
          eq(rooms.phase, "scheduled"),
          isNull(rooms.closedAt),
          sql`${rooms.startsAt} >= ${new Date(first).toISOString()}::timestamptz`,
          sql`${rooms.startsAt} < ${new Date(end).toISOString()}::timestamptz`,
          inArray(rooms.hostUserId, db.select({ userId: pomodoroSimulatedAccounts.userId }).from(pomodoroSimulatedAccounts))
        )
      ),
  ])
  const names = new Map(accounts.map((account) => [account.userId, account.name]))
  for (const account of accounts) {
    const today = localDateFor(account.habits.timezone, now)
    for (const localDate of [today, shiftDate(today, 1)]) {
      const plan = planSimulatedDay(account.userId, account.habits, localDate, hoursCap)
      for (const session of plan.sessions) {
        const hour = slot(session.startsAt.getTime())
        // Once per hour, though two short sessions can both start in it.
        if (hour && session.startsAt >= now && !hour.focusing.some((person) => person.userId === account.userId))
          hour.focusing.push({ userId: account.userId, name: account.name })
      }
      const opening = account.habits.host && plan.sessions[0]
      const hour = opening ? slot(opening.startsAt.getTime()) : null
      if (hour && opening && opening.startsAt >= now)
        hour.rooms.push({ name: account.habits.host!.roomName, host: account.name, weekly: false })
    }
  }
  for (const room of booked) {
    const hour = room.startsAt ? slot(room.startsAt.getTime()) : null
    if (hour) hour.rooms.push({ name: room.name, host: names.get(room.hostUserId) ?? "A made-up host", weekly: true })
  }
  return hours
}

/**
 * The pause switch on a row (Part 2). A paused account finishes the session
 * it is in, leaves its room at the next break, and starts nothing new. One
 * request for every row ticked; each change is an audit row.
 */
export async function setSimulatedPaused({
  userIds,
  paused,
  actorUserId,
  now = new Date(),
}: {
  userIds: string[]
  paused: boolean
  actorUserId: string
  now?: Date
}) {
  return db.transaction(async (tx) => {
    const changed = await tx
      .update(pomodoroSimulatedAccounts)
      .set({ pausedAt: paused ? now : null })
      .where(
        and(
          inArray(pomodoroSimulatedAccounts.userId, userIds),
          paused ? isNull(pomodoroSimulatedAccounts.pausedAt) : isNotNull(pomodoroSimulatedAccounts.pausedAt)
        )
      )
      .returning({ userId: pomodoroSimulatedAccounts.userId })
    const ids = changed.map((row) => row.userId)
    if (ids.length)
      await tx.insert(pomodoroAuditLogs).values({
        actorUserId,
        action: paused ? "simulated_pause_account" : "simulated_unpause_account",
        resource: "simulated",
        recordIds: ids,
      })
    return { changed: ids, skipped: userIds.filter((id) => !ids.includes(id)) }
  })
}
