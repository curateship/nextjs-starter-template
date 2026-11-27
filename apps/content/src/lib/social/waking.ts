/**
 * Waking hours: whether an account is up at a given moment, in its own time
 * zone, and when it next wakes.
 *
 * An account acts only inside its waking hours, so it never comments at 4am
 * every night. The hours are minutes past midnight on the account's own
 * clock, which is the clock its browser shows: a proxy in Germany wakes at
 * German morning. A stretch may run past midnight, 22:00 to 2:00 for one.
 *
 * Plain arithmetic on `Intl`, no date library. Moving forward by whole minutes
 * and then reading the local clock again covers the two days a year the clocks
 * change: the first guess is off by the hour, and one correction fixes it.
 */

const MINUTES_PER_DAY = 1440

/** The zone if `Intl` knows it, otherwise UTC, so a bad value never throws. */
export function knownTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC"
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format(0)
    return timeZone
  } catch {
    return "UTC"
  }
}

/** Minutes past midnight on that zone's clock at `at`. */
export function localMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: knownTimeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at)
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0)
  return hour * 60 + minute
}

/** That zone's date at `at`, as "2026-10-12", so two moments can be compared by day. */
export function localDateKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: knownTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at)
}

/** Whether `minute` falls inside from-until. A stretch past midnight wraps. */
function inside(minute: number, from: number, until: number): boolean {
  if (from === until) return true
  return from < until ? minute >= from && minute < until : minute >= from || minute < until
}

export function isAwake(at: Date, timeZone: string, from: number, until: number): boolean {
  return inside(localMinutes(at, timeZone), from, until)
}

/**
 * The first moment at or after `at` when that zone's clock reads `target`
 * minutes past midnight, at the start of that minute.
 */
export function nextLocalMinute(at: Date, timeZone: string, target: number): Date {
  const startOfMinute = new Date(Math.floor(at.getTime() / 60_000) * 60_000)
  const now = localMinutes(startOfMinute, timeZone)
  let ahead = (target - now + MINUTES_PER_DAY) % MINUTES_PER_DAY
  if (ahead === 0 && startOfMinute.getTime() < at.getTime()) ahead = MINUTES_PER_DAY
  const guess = new Date(startOfMinute.getTime() + ahead * 60_000)
  // Across a clock change the guess lands an hour out; one look fixes it.
  const off = localMinutes(guess, timeZone) - target
  if (off === 0) return guess
  const correction = off > MINUTES_PER_DAY / 2 ? off - MINUTES_PER_DAY : off < -MINUTES_PER_DAY / 2 ? off + MINUTES_PER_DAY : off
  return new Date(guess.getTime() - correction * 60_000)
}

/** When the account next wakes, or null when it is awake at `at`. */
export function nextWakeAt(at: Date, timeZone: string, from: number, until: number): Date | null {
  if (isAwake(at, timeZone, from, until)) return null
  return nextLocalMinute(at, timeZone, from)
}

/** When the stretch the account is awake in now ends. Only meaningful while awake. */
export function wakeEndsAt(at: Date, timeZone: string, until: number): Date {
  return nextLocalMinute(at, timeZone, until)
}

/** "8:00", "23:30": a minute past midnight as a clock reads it. */
export function clockText(minute: number): string {
  const hour = Math.floor(minute / 60)
  return `${hour}:${String(minute % 60).padStart(2, "0")}`
}

/** "14:05 in America/Toronto": that zone's clock at `at`, for a line on screen. */
export function zoneClockText(at: Date, timeZone: string): string {
  const zone = knownTimeZone(timeZone)
  return `${clockText(localMinutes(at, zone))} in ${zone}`
}
