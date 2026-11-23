import { gte, inArray, sql } from "drizzle-orm"

import {
  cleanPomodoroRowSettings,
  type FocusHoursRowData,
  type OpenRoomsRowData,
} from "@/lib/pomodoro/front-page-rows"
import { shiftLocalDate } from "@/lib/pomodoro/focus-history"
import { db } from "@/server/db"
import { dailyFocusStats, rooms } from "@/server/pomodoro/schema"
import { localDateFor } from "@/server/pomodoro/productivity"
import type { AppFrontPageRowRequest } from "@/server/app-options"

/**
 * What fills the two public front page rows: hours focused in the last seven
 * days, and how many rooms are open right now.
 *
 * **Neither figure is read per visitor.** This is the signed-out front page, so
 * a visit must never become a database query. Each number is read once and held
 * for a window, and every visitor inside that window is served the held number.
 * Two windows, because the two numbers move at different speeds: a week's total
 * barely shifts in five minutes, while a room opening should show up inside a
 * minute.
 *
 * **Neither figure names anybody.** They are one total and one count, with no
 * account, no display name and no task in either, so the rows say nothing a
 * member did not already publish by existing.
 *
 * A row under its floor answers `null`, which is how the shell is told to leave
 * it off the page. See `src/lib/pomodoro/front-page-rows.ts` for why.
 */

const HOURS_CACHE_MS = 5 * 60_000
const ROOMS_CACHE_MS = 60_000

/**
 * Phases that mean a room is open. `scheduled` is booked but not yet started and
 * `closed` is over, so neither is running now.
 */
const OPEN_ROOM_PHASES = ["waiting", "focus", "short", "long"]

type Held<T> = { value: T; expiresAt: number }

let heldHours: Held<{ hours: number; sessions: number }> | null = null
let heldRooms: Held<number> | null = null

/**
 * Hours focused across every account in the last seven days.
 *
 * The seven days are UTC calendar days. A public page has no viewer whose
 * timezone could anchor a week, and the figure is a total across everybody's
 * days, so one clock is the only honest choice.
 */
async function readFocusHours(now: number) {
  if (heldHours && heldHours.expiresAt > now) return heldHours.value

  const today = localDateFor("UTC")
  const start = shiftLocalDate(today, -6)
  const [row] = await db
    .select({
      seconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::bigint`,
      sessions: sql<number>`coalesce(sum(${dailyFocusStats.focusSessions}), 0)::int`,
    })
    .from(dailyFocusStats)
    .where(gte(dailyFocusStats.localDate, start))

  const value = {
    // Whole hours down, so the page never claims an hour that was not focused.
    hours: Math.floor(Number(row?.seconds ?? 0) / 3_600),
    sessions: Number(row?.sessions ?? 0),
  }
  heldHours = { value, expiresAt: now + HOURS_CACHE_MS }
  return value
}

async function readOpenRooms(now: number) {
  if (heldRooms && heldRooms.expiresAt > now) return heldRooms.value

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rooms)
    .where(inArray(rooms.phase, OPEN_ROOM_PHASES))

  const value = row?.count ?? 0
  heldRooms = { value, expiresAt: now + ROOMS_CACHE_MS }
  return value
}

export async function readFocusHoursRow({
  settings,
}: AppFrontPageRowRequest): Promise<FocusHoursRowData | null> {
  const { floor } = cleanPomodoroRowSettings("focus-hours", settings)
  const { hours, sessions } = await readFocusHours(Date.now())
  if (hours < floor) return null
  return { hours, sessions }
}

export async function readOpenRoomsRow({
  settings,
}: AppFrontPageRowRequest): Promise<OpenRoomsRowData | null> {
  const { floor } = cleanPomodoroRowSettings("open-rooms", settings)
  const openRooms = await readOpenRooms(Date.now())
  if (openRooms < floor) return null
  return { rooms: openRooms }
}
