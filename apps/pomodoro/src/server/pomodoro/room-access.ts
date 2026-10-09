import { and, desc, eq, gt, isNull, or } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { loadAppSettings } from "@/server/pomodoro/app-settings"
import { pomodoroProfiles, pomodoroSuspensions } from "@/server/pomodoro/schema"
import { roomsSuspendedMessage } from "@/lib/pomodoro/notices"
import { CHAT_PAUSED, NEW_ROOMS_PAUSED, ROOM_REFUSAL } from "@/lib/pomodoro/room-join"

/**
 * The checks at every way into a room (admin task 05): a suspended member,
 * and the two pause switches. Kept apart from `safety.ts`, which takes people
 * out of rooms, so `rooms.ts` can call these without importing itself back.
 *
 * A refusal throws `ROOM_REFUSED: <sentence>`, and the member's screen shows
 * the sentence as it stands.
 */

type Database = CustomShellDb

/**
 * "15 Oct, 23:00" on the member's own clock. The time is named because a
 * suspension made late in the evening ends late the next evening, and a date
 * alone would read as over that morning.
 */
export function shortDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).format(date)
}

export async function timezoneOf(userId: string, database: Database) {
  const [profile] = await database.select({ timezone: pomodoroProfiles.timezone }).from(pomodoroProfiles).where(eq(pomodoroProfiles.userId, userId)).limit(1)
  return profile?.timezone ?? "UTC"
}

/** A suspension still running: not lifted, and either open-ended or not yet over. */
export function runningSuspension(now: Date) {
  return and(isNull(pomodoroSuspensions.liftedAt), or(isNull(pomodoroSuspensions.endsAt), gt(pomodoroSuspensions.endsAt, now)))
}

export async function findSuspension(userId: string, database: Database = db, now = new Date()) {
  const [row] = await database
    .select()
    .from(pomodoroSuspensions)
    .where(and(eq(pomodoroSuspensions.userId, userId), runningSuspension(now)))
    .orderBy(desc(pomodoroSuspensions.createdAt))
    .limit(1)
  return row ?? null
}

/**
 * Refuses a suspended member at every way into a room: joining, opening,
 * booking, a weekly rule, and sending a message. It ends by itself on its
 * date, so nothing has to run for them to be let back in.
 */
export async function assertMayUseRooms(userId: string, database: Database = db, now = new Date()) {
  const suspension = await findSuspension(userId, database, now)
  if (!suspension) return
  const until = suspension.endsAt ? shortDate(suspension.endsAt, await timezoneOf(userId, database)) : null
  throw new Error(`${ROOM_REFUSAL}${roomsSuspendedMessage(until)} ${suspension.reason}`)
}

/** The "Pause new rooms" switch. Rooms already open carry on. */
export async function assertNewRoomsOpen() {
  if ((await loadAppSettings())["safety.pause"].newRooms) throw new Error(`${ROOM_REFUSAL}${NEW_ROOMS_PAUSED}`)
}

/** The "Pause all chat" switch: every room's message box refuses to send. */
export async function assertChatOpen() {
  if ((await loadAppSettings())["safety.pause"].chat) throw new Error(`${ROOM_REFUSAL}${CHAT_PAUSED}`)
}
