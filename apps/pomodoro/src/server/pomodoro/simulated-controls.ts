import { and, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm"

import {
  SIMULATED_HOURS_FLOOR,
  SIMULATED_HOURS_STEP,
} from "@/lib/pomodoro/app-settings"
import { leaderboardStartDate } from "@/lib/pomodoro/leaderboard-windows"
import { shiftDate, weekdayOf } from "@/lib/pomodoro/simulated-days"
import { db } from "@/server/db"
import { forgetAppSettings, loadAppSettings } from "@/server/pomodoro/app-settings"
import { globalBoardRule } from "@/server/pomodoro/leaderboard"
import { localDateFor } from "@/server/pomodoro/productivity"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroProfiles,
  pomodoroSettings,
  pomodoroSimulatedAccounts,
  pomodoroSimulatedLines,
} from "@/server/pomodoro/schema"

/**
 * Tyler's controls over the made-up members (live activity task 05). See
 * "Your controls" in `workspace/docs/made-up-members.md`.
 *
 * Tasks 01 to 04 make the app look busy; this file makes sure the only person
 * who is not fooled is Tyler: real members stay on top, the chat has a daily
 * cap, the workers know whether anybody real is on the site, and a restart
 * leaves no session running that should have ended.
 */

/** Not a made-up account, in SQL, for the filters that leave them out. */
export const isReal = (userId: unknown) =>
  sql`not exists (select 1 from pomodoro_simulated_accounts s where s.user_id = ${userId})`

// ---------------------------------------------------------------------------
// Part 1: real members stay on top
// ---------------------------------------------------------------------------

/** How far below the top real member a made-up account's week is held. */
const CEILING_MARGIN_SECONDS = 15 * 60

/** The first day of the board's "This week" (the last 7 days), in UTC days like the admin board. */
export function boardWeekStart(now: Date) {
  return leaderboardStartDate("week", localDateFor("UTC", now))
}

/**
 * The most focus a made-up account may have this week, or null when no real
 * member on the global board has passed "Keep real members above" yet. It is
 * the top real member's week less a quarter of an hour, so they stay first.
 * Read once per worker pass.
 */
export async function realWeekCeiling(now: Date) {
  const { aboveHours } = (await loadAppSettings())["simulated.realFirst"]
  const seconds = sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::int`
  const [top] = await db
    .select({ seconds })
    .from(dailyFocusStats)
    .innerJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, dailyFocusStats.userId))
    .where(and(gte(dailyFocusStats.localDate, boardWeekStart(now)), globalBoardRule(), isReal(dailyFocusStats.userId)))
    .groupBy(dailyFocusStats.userId)
    .orderBy(desc(seconds))
    .limit(1)
  if (!top || top.seconds < aboveHours * 3_600) return null
  return Math.max(0, top.seconds - CEILING_MARGIN_SECONDS)
}

/**
 * How long a made-up session may run under the ceiling: the planned length,
 * cut to what is left of this account's week. Never deletes anything, so a
 * profile's figures never go backwards; an account already over simply
 * starts nothing until the week moves on.
 */
export async function secondsUnderCeiling(userId: string, plannedSeconds: number, ceiling: number | null, now: Date) {
  if (ceiling === null) return plannedSeconds
  const [week] = await db
    .select({ seconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::int` })
    .from(dailyFocusStats)
    .where(and(eq(dailyFocusStats.userId, userId), gte(dailyFocusStats.localDate, boardWeekStart(now))))
  return Math.min(plannedSeconds, ceiling - (week?.seconds ?? 0))
}

/** The pomodoro_settings row that says what the fade last did, and in which week. */
const FADE_KEY = "simulated.fade"

export type SimulatedFade = {
  /** The Monday (UTC) of the week the dial was looked at. */
  week: string
  /** Real members' focus in the week before, in hours. */
  realHours: number
  from: number
  to: number
}

/** The Monday of the week holding `localDate`. */
function mondayOf(localDate: string) {
  return shiftDate(localDate, -((weekdayOf(localDate) + 6) % 7))
}

/**
 * Once a week, on the first pass after Monday 00:00 UTC: when real members
 * together focused more than "Fade after" hours the week before, the
 * hours-a-day dial drops a quarter of an hour, never under one hour. The
 * row is claimed before the dial moves, so two server copies never lower it
 * twice. Answers what it did, or null when this week was already looked at.
 */
export async function fadeDialOnceAWeek(now: Date) {
  const week = mondayOf(localDateFor("UTC", now))
  const [seen] = await db
    .select({ value: pomodoroSettings.value })
    .from(pomodoroSettings)
    .where(eq(pomodoroSettings.key, FADE_KEY))
  if ((seen?.value as SimulatedFade | undefined)?.week === week) return null

  const settings = await loadAppSettings()
  const accounts = settings["simulated.accounts"]
  const [real] = await db
    .select({ seconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::int` })
    .from(dailyFocusStats)
    .where(
      and(
        gte(dailyFocusStats.localDate, shiftDate(week, -7)),
        lte(dailyFocusStats.localDate, shiftDate(week, -1)),
        isReal(dailyFocusStats.userId)
      )
    )
  const realHours = Math.round(((real?.seconds ?? 0) / 3_600) * 10) / 10
  const from = accounts.hoursCap
  const to =
    realHours > settings["simulated.realFirst"].fadeAfterHours
      ? Math.max(SIMULATED_HOURS_FLOOR, from - SIMULATED_HOURS_STEP)
      : from
  const fade: SimulatedFade = { week, realHours, from, to }

  const changed = await db.transaction(async (tx) => {
    const claimed = await tx
      .insert(pomodoroSettings)
      .values({ key: FADE_KEY, value: fade, updatedAt: now })
      .onConflictDoUpdate({
        target: pomodoroSettings.key,
        set: { value: fade, updatedAt: now },
        setWhere: sql`${pomodoroSettings.value} ->> 'week' is distinct from ${week}`,
      })
      .returning({ key: pomodoroSettings.key })
    if (!claimed.length || to === from) return false
    // Written by the worker, so no admin is named on it.
    await tx
      .insert(pomodoroSettings)
      .values({ key: "simulated.accounts", value: { ...accounts, hoursCap: to }, updatedAt: now })
      .onConflictDoUpdate({
        target: pomodoroSettings.key,
        set: { value: { ...accounts, hoursCap: to }, updatedByUserId: null, updatedAt: now },
      })
    return true
  })
  if (changed) forgetAppSettings()
  return fade
}

/** What the fade did most recently, for the card. */
export async function readLastFade() {
  const [row] = await db
    .select({ value: pomodoroSettings.value })
    .from(pomodoroSettings)
    .where(eq(pomodoroSettings.key, FADE_KEY))
  return (row?.value as SimulatedFade | undefined) ?? null
}

// ---------------------------------------------------------------------------
// Part 4: the chat cap
// ---------------------------------------------------------------------------

function utcMidnight(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/**
 * What the room chat's AI lines cost since midnight UTC, in cents with the
 * fractions kept. Read from `pomodoro_simulated_lines`, which holds the same
 * cost the AI usage page is sent, because that page stores each call in whole
 * cents: a line costs about a twentieth of a cent, so the page shows most of
 * them as nothing and could never reach a cap.
 */
export async function chatSpentTodayCents(now: Date) {
  const [row] = await db
    .select({ cents: sql<number>`coalesce(sum(${pomodoroSimulatedLines.costCents}), 0)::float` })
    .from(pomodoroSimulatedLines)
    .where(gte(pomodoroSimulatedLines.createdAt, utcMidnight(now)))
  return row?.cents ?? 0
}

/** Whether the next line may be written by the AI, or must be a fixed one until midnight UTC. */
export async function chatUnderCap(now: Date) {
  const { centsPerDay } = (await loadAppSettings())["simulated.chatCap"]
  return (await chatSpentTodayCents(now)) < centsPerDay
}

// ---------------------------------------------------------------------------
// Part 7: is anybody real here
// ---------------------------------------------------------------------------

/** The pomodoro_settings row whose `updated_at` is the last moment somebody real was on the site. */
const REAL_SEEN_KEY = "simulated.realSeen"
/** One write per server copy in this long, however many timers poll. */
const NOTE_EVERY_MS = 30_000
/** "Someone real is here": seen in this long. */
const LOOKING_MS = 2 * 60_000
/** Nobody real for this long, and no new room opens. */
const QUIET_AFTER_MS = 60 * 60_000

let notedAt = 0

/**
 * Somebody real is on the site: their timer polled, or their room's live
 * connection beat. Kept in the database rather than in this process, because
 * in production the workers run as a separate program and never see a poll.
 * Only signed-in members call it, and nobody can sign in as a made-up account.
 */
export async function noteRealVisit(now = new Date()) {
  if (Math.abs(now.getTime() - notedAt) < NOTE_EVERY_MS) return
  notedAt = now.getTime()
  try {
    await db
      .insert(pomodoroSettings)
      .values({ key: REAL_SEEN_KEY, value: {}, updatedAt: now })
      .onConflictDoUpdate({ target: pomodoroSettings.key, set: { updatedAt: now } })
  } catch (error) {
    // Losing one mark only makes the rooms a little quieter for a minute.
    console.error("a real visit could not be noted for the made-up members", error)
  }
}

type RealPresence = {
  /** Somebody real in the last two minutes: rooms open sooner, chat steps up. */
  looking: boolean
  /** Nobody real for an hour: no new room, and only the opening line. */
  quiet: boolean
  lastSeenAt: Date | null
}

/**
 * Whether somebody real is here. Before any real visit has ever been noted,
 * on a new database, it is neither: the workers run as they did before this
 * rule, so a site nobody has signed into yet still looks lived in.
 */
export async function readRealPresence(now: Date): Promise<RealPresence> {
  const [row] = await db
    .select({ at: pomodoroSettings.updatedAt })
    .from(pomodoroSettings)
    .where(eq(pomodoroSettings.key, REAL_SEEN_KEY))
  if (!row) return { looking: false, quiet: false, lastSeenAt: null }
  const since = now.getTime() - row.at.getTime()
  return { looking: since <= LOOKING_MS, quiet: since > QUIET_AFTER_MS, lastSeenAt: row.at }
}

// ---------------------------------------------------------------------------
// Part 10: a restart leaves no ghost
// ---------------------------------------------------------------------------

/**
 * The worker's first pass after it starts: a made-up session still running
 * whose end passed over an hour ago is cancelled, because the timer's own
 * rule stops calling a session live an hour past its end. One that ended
 * within the hour is left for the day pass to finish through
 * `completeProductivitySession`, as it does every minute. Answers how many
 * were cancelled.
 */
export async function cancelGhostSessions(now: Date) {
  const cancelled = await db
    .update(focusSessions)
    .set({ status: "cancelled", targetEndsAt: null, updatedAt: now })
    .where(
      and(
        inArray(focusSessions.status, ["running", "paused"]),
        lt(focusSessions.targetEndsAt, new Date(now.getTime() - 60 * 60_000)),
        inArray(
          focusSessions.userId,
          db.select({ userId: pomodoroSimulatedAccounts.userId }).from(pomodoroSimulatedAccounts)
        )
      )
    )
    .returning({ id: focusSessions.id })
  return cancelled.length
}
