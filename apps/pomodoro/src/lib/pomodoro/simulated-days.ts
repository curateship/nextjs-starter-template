import type { SimulatedHost } from "@/lib/pomodoro/simulated-rooms"

/**
 * The working day of a made-up member (live activity task 01, Parts 3, 4 and
 * 6). See `workspace/docs/made-up-members.md`.
 *
 * A day is worked out, never stored: the same account, habit and date always
 * give the same sessions at the same times. The history written when an
 * account is made and the worker that runs today both call
 * `planSimulatedDay`, so the past and the present follow one set of rules, and
 * a worker that restarts mid-day picks up exactly where it was.
 *
 * Each draw is seeded by the account, the month or the day, so two accounts
 * never share a day and one account's days never repeat.
 */

export type SimulatedHabits = {
  timezone: string
  city: string
  /** Local hour the day usually starts, in quarter hours: 8.25 is 8:15. */
  startHour: number
  /** The hours focused on a normal day before the card's cap. 2 to 4. */
  hoursADay: number
  /** Weekdays with no work, 0 Sunday to 6 Saturday. */
  daysOff: number[]
  /** Shortest and longest focus, in minutes; each session is drawn between. */
  sessionMinutes: [number, number]
  /** Shortest and longest gap between sessions, in minutes. */
  breakMinutes: [number, number]
  /** How many days of history were written when the account was made. */
  historyDays: number
  /** The titles this person's tasks are picked from. */
  taskTitles: string[]
  /** Set for the accounts that host rooms (task 02); see `simulated-rooms.ts`. */
  host?: SimulatedHost
}

type PlannedSession = {
  /** The session's place in the day, which also names it: `sessionKey`. */
  index: number
  startsAt: Date
  minutes: number
  /** Which of the day's tasks the session counts towards. */
  taskIndex: number
}

type PlannedTask = {
  index: number
  title: string
  /** Picks one of the account's projects (taken modulo their number), or none. */
  projectSlot: number | null
  /** Whether it is ticked once its last session finishes. */
  ticked: boolean
}

export type DayPlan = {
  localDate: string
  sessions: PlannedSession[]
  tasks: PlannedTask[]
}

const DAY_MINUTES = 24 * 60
/** No session is started this late, so a day never runs into tomorrow. */
const LATEST_END_MINUTE = 23 * 60 + 30
/** A last stretch shorter than this is not worth a session. */
const SHORTEST_SESSION = 10

// ---------------------------------------------------------------------------
// Seeded draws
// ---------------------------------------------------------------------------

function hashString(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** A repeatable stream of numbers from 0 to 1, seeded by the parts given. */
export function seededRandom(...parts: Array<string | number>) {
  let state = hashString(parts.join("|"))
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

export type Random = () => number

/** A whole number from `low` to `high`, both included. */
export function drawInt(random: Random, low: number, high: number) {
  return low + Math.floor(random() * (high - low + 1))
}

export function drawFrom<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]
}

/** The items in a repeatable shuffled order. */
export function shuffled<T>(random: Random, items: readonly T[]): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}

// ---------------------------------------------------------------------------
// A new habit
// ---------------------------------------------------------------------------

const SESSION_RANGES: ReadonlyArray<[number, number]> = [
  [20, 45],
  [25, 50],
  [30, 55],
  [20, 55],
  [35, 60],
  [15, 40],
]
const BREAK_RANGES: ReadonlyArray<[number, number]> = [
  [5, 10],
  [5, 15],
  [8, 20],
  [10, 20],
]

/**
 * A new person's habit. Most take the weekend off and some a weekday as well;
 * the rest work every day. Days start between 7am and 1pm local, so every
 * account works in its own city's daytime.
 */
export function drawHabits(
  random: Random,
  place: { timezone: string; city: string },
  taskTitles: string[],
  historyDays: number
): SimulatedHabits {
  const daysOff = new Set<number>()
  if (random() < 0.6) {
    daysOff.add(0)
    daysOff.add(6)
  }
  const extra = random() < 0.5 ? 0 : random() < 0.7 ? 1 : 2
  for (const day of shuffled(random, [1, 2, 3, 4, 5]).slice(0, extra))
    daysOff.add(day)
  return {
    timezone: place.timezone,
    city: place.city,
    startHour: 7 + drawInt(random, 0, 24) / 4,
    hoursADay: Math.round((2 + random() * 2) * 10) / 10,
    daysOff: [...daysOff].sort(),
    sessionMinutes: [...drawFrom(random, SESSION_RANGES)],
    breakMinutes: [...drawFrom(random, BREAK_RANGES)],
    historyDays,
    taskTitles,
  }
}

// ---------------------------------------------------------------------------
// Months and days
// ---------------------------------------------------------------------------

type MonthShape = {
  /** One account in twenty goes quiet for a month. */
  quiet: boolean
  /** First day of a week off, or null; one in eight months has one. */
  weekOffFrom: number | null
  /** How far the start moves this month, in minutes, up to two hours. */
  startShift: number
  /** How the hours move this month, inside the cap. */
  hoursFactor: number
}

/** How a habit drifts in one calendar month (`yyyy-mm`). */
function monthShape(userId: string, month: string): MonthShape {
  const random = seededRandom("month", userId, month)
  return {
    quiet: random() < 1 / 20,
    weekOffFrom: random() < 1 / 8 ? drawInt(random, 1, 22) : null,
    startShift: (drawInt(random, 0, 16) - 8) * 15,
    hoursFactor: 0.9 + random() * 0.2,
  }
}

function dateParts(localDate: string) {
  const [year, month, day] = localDate.split("-").map(Number)
  return { year, month, day }
}

export function weekdayOf(localDate: string) {
  const { year, month, day } = dateParts(localDate)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** The calendar day `days` after (or before) `localDate`. */
export function shiftDate(localDate: string, days: number) {
  const { year, month, day } = dateParts(localDate)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

const offsetFormats = new Map<string, Intl.DateTimeFormat>()

/** How far ahead of UTC a timezone is at one moment, in minutes. */
export function offsetMinutes(timeZone: string, at: number) {
  let format = offsetFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    offsetFormats.set(timeZone, format)
  }
  const parts = Object.fromEntries(
    format.formatToParts(new Date(at)).map((part) => [part.type, part.value])
  )
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute)
  )
  return Math.round((asUtc - Math.floor(at / 60_000) * 60_000) / 60_000)
}

/** The moment a local clock in `timeZone` reads `minuteOfDay` on `localDate`. */
export function zonedInstant(localDate: string, minuteOfDay: number, timeZone: string) {
  const { year, month, day } = dateParts(localDate)
  const wall = Date.UTC(year, month - 1, day, 0, minuteOfDay)
  const first = wall - offsetMinutes(timeZone, wall) * 60_000
  // Asked twice so a day that changes the clocks lands on the right side.
  return new Date(wall - offsetMinutes(timeZone, first) * 60_000)
}

/** Whether the person works at all that day, before any sessions are drawn. */
function worksOn(userId: string, habits: SimulatedHabits, localDate: string, month: MonthShape) {
  if (month.quiet) return false
  if (habits.daysOff.includes(weekdayOf(localDate))) return false
  const day = dateParts(localDate).day
  if (month.weekOffFrom !== null && day >= month.weekOffFrom && day < month.weekOffFrom + 7)
    return false
  // A day off now and then that no rule explains: ill, busy, a friend's
  // wedding. Nothing is ever perfect for ninety days.
  return seededRandom("skip", userId, localDate)() >= 1 / 14
}

/**
 * The day's sessions and tasks. `hoursCap` is the card's "Hours a day": no
 * day ever plans more focus than it, whatever the habit says.
 */
export function planSimulatedDay(
  userId: string,
  habits: SimulatedHabits,
  localDate: string,
  hoursCap: number
): DayPlan {
  const empty: DayPlan = { localDate, sessions: [], tasks: [] }
  const month = monthShape(userId, localDate.slice(0, 7))
  if (!worksOn(userId, habits, localDate, month)) return empty

  const random = seededRandom("day", userId, localDate)
  const lowest = Math.min(2, hoursCap)
  const highest = Math.min(4, hoursCap)
  const usual = Math.min(highest, Math.max(lowest, habits.hoursADay * month.hoursFactor))
  const hours = Math.min(hoursCap, usual * (0.95 + random() * 0.1))
  let remaining = Math.round(hours * 60)

  const [shortest, longest] = habits.sessionMinutes
  const [shortBreak, longBreak] = habits.breakMinutes
  const jitter = (drawInt(random, 0, 12) - 6) * 5
  // Held between 6:30 and 2:30 first and wobbled after, so a start pushed
  // early by the month never lands on the same minute for everybody.
  let minute = Math.min(14.5 * 60, Math.max(6.5 * 60, habits.startHour * 60 + month.startShift)) + jitter
  const dayStart = zonedInstant(localDate, 0, habits.timezone).getTime()

  const lengths: Array<{ start: number; minutes: number }> = []
  let lunchTaken = false
  const lunchAfter = remaining / 2
  let focused = 0
  while (remaining >= SHORTEST_SESSION) {
    let minutes = drawInt(random, shortest, longest)
    // The last stretch is folded into one session rather than left as a
    // ten-minute stub, so the day lands near its hours.
    if (remaining - minutes < SHORTEST_SESSION) minutes = remaining
    if (minute + minutes > LATEST_END_MINUTE) break
    lengths.push({ start: minute, minutes })
    remaining -= minutes
    focused += minutes
    minute += minutes + drawInt(random, shortBreak, longBreak)
    if (!lunchTaken && focused >= lunchAfter) {
      lunchTaken = true
      if (random() < 0.6) minute += drawInt(random, 30, 75)
    }
  }
  if (!lengths.length) return empty

  // One to three tasks, each taking a run of the day's sessions in order.
  const taskCount = Math.min(lengths.length, drawInt(random, 1, 3))
  const titles = shuffled(random, habits.taskTitles)
  const tasks: PlannedTask[] = Array.from({ length: taskCount }, (_, index) => ({
    index,
    title: titles[index % titles.length] ?? "Focus",
    projectSlot: random() < 0.1 ? null : drawInt(random, 0, 7),
    ticked: random() < 0.85,
  }))
  const sessions = lengths.map((length, index) => ({
    index,
    startsAt: new Date(dayStart + length.start * 60_000),
    minutes: length.minutes,
    taskIndex: Math.min(taskCount - 1, Math.floor((index * taskCount) / lengths.length)),
  }))
  return { localDate, sessions, tasks }
}

/** Whether `session` is its task's last one that day. */
export function lastSessionOfTask(plan: DayPlan, session: PlannedSession) {
  return !plan.sessions.some(
    (other) => other.taskIndex === session.taskIndex && other.index > session.index
  )
}

/** The session the clock is inside right now, if any. */
export function sessionAt(plan: DayPlan, at: Date) {
  const time = at.getTime()
  return (
    plan.sessions.find(
      (session) =>
        session.startsAt.getTime() <= time &&
        time < session.startsAt.getTime() + session.minutes * 60_000
    ) ?? null
  )
}

/** The idempotency key of one planned session: one row per session, ever. */
export function sessionKey(localDate: string, index: number) {
  return `simulated:${localDate}:${index}`
}

/** The date and index a session key names, or null for anybody else's key. */
export function readSessionKey(key: string) {
  const match = /^simulated:(\d{4}-\d{2}-\d{2}):(\d+)$/.exec(key)
  return match ? { localDate: match[1], index: Number(match[2]) } : null
}

/**
 * How long after the newest account the next one arrives while the count is
 * under the dial: three to five days, so one or two a week.
 */
export function arrivalGapMs(newestUserId: string) {
  const days = 3 + seededRandom("arrival", newestUserId)() * 2
  return Math.round(days * DAY_MINUTES * 60_000)
}
