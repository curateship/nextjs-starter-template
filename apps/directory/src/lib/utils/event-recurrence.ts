// Recurring-event rules: the shape, plain-English description, and the pure date
// math that turns a rule into upcoming dates. No DB and no `new Date()` inside the
// date helpers — every function is deterministic on its inputs so the same rule
// always yields the same dates. Dates are floating `YYYY-MM-DD` strings (no
// timezone), matching how events store their date in the event-content block.
//
// weekday: 0=Sunday .. 6=Saturday (matches Date.getUTCDay()).
// week (monthly): 1..4 for first..fourth, -1 for the last of the month.

export interface RecurrenceWeekly {
  freq: 'weekly'
  /** Days of the week the event repeats on (0=Sun..6=Sat), at least one. */
  weekdays: number[]
  /** Last date the series may produce, `YYYY-MM-DD`. Null/omitted = no end. */
  until?: string | null
}

export interface RecurrenceMonthly {
  freq: 'monthly'
  /** Which weekday-of-month: 1..4 = first..fourth, -1 = last. */
  week: number
  /** Weekday (0=Sun..6=Sat). */
  weekday: number
  until?: string | null
}

export type RecurrenceRule = RecurrenceWeekly | RecurrenceMonthly

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ORDINAL_NAMES: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' }

// --- Date helpers (UTC used purely as a timezone-neutral calendar calculator) ---

interface Ymd {
  year: number
  month: number // 1-12
  day: number
}

function parseYmd(value: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  // Reject impossible days (e.g. Feb 30) by round-tripping through UTC.
  const dt = new Date(Date.UTC(year, month - 1, day))
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null
  return { year, month, day }
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatYmd(ymd: Ymd) {
  return `${ymd.year}-${pad(ymd.month)}-${pad(ymd.day)}`
}

/** Day of week for a `YYYY-MM-DD` string (0=Sun..6=Sat), or null if unparseable. */
export function weekdayOf(dateStr: string): number | null {
  const ymd = parseYmd(dateStr)
  if (!ymd) return null
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay()
}

/** Add `days` (may be negative) to a `YYYY-MM-DD` string. */
export function addDays(dateStr: string, days: number): string | null {
  const ymd = parseYmd(dateStr)
  if (!ymd) return null
  const shifted = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day) + days * 86_400_000)
  return formatYmd({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() })
}

/**
 * The nth weekday of a given month, or null if it doesn't exist (e.g. a 5th
 * Friday in a month that has only four). `week` = 1..4 or -1 (last).
 */
export function nthWeekdayOfMonth(year: number, month: number, week: number, weekday: number): string | null {
  if (week === -1) {
    // Walk back from the last day of the month to the target weekday.
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    for (let day = lastDay; day >= lastDay - 6; day--) {
      if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === weekday) {
        return formatYmd({ year, month, day })
      }
    }
    return null
  }
  if (week < 1 || week > 4) return null
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const offset = (weekday - firstWeekday + 7) % 7
  const day = 1 + offset + (week - 1) * 7
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day > daysInMonth) return null
  return formatYmd({ year, month, day })
}

// Safety caps so a malformed rule can never loop forever.
const WEEKLY_LOOKAHEAD_DAYS = 366 * 2
const MONTHLY_LOOKAHEAD_MONTHS = 48

/**
 * The first date the rule produces strictly AFTER `afterDateStr`, honoring the
 * rule's `until` end date. Returns null when the series has ended or the rule is
 * unusable.
 */
export function nextMatchingDate(rule: RecurrenceRule, afterDateStr: string): string | null {
  const after = parseYmd(afterDateStr)
  if (!after) return null
  const until = typeof rule.until === 'string' ? rule.until : null

  if (rule.freq === 'weekly') {
    const days = [...new Set(rule.weekdays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    if (days.length === 0) return null
    for (let i = 1; i <= WEEKLY_LOOKAHEAD_DAYS; i++) {
      const candidate = addDays(afterDateStr, i)
      if (!candidate) return null
      if (until && candidate > until) return null
      const wd = weekdayOf(candidate)
      if (wd !== null && days.includes(wd)) return candidate
    }
    return null
  }

  // monthly nth-weekday
  if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) return null
  let year = after.year
  let month = after.month
  for (let i = 0; i <= MONTHLY_LOOKAHEAD_MONTHS; i++) {
    const candidate = nthWeekdayOfMonth(year, month, rule.week, rule.weekday)
    if (candidate && candidate > afterDateStr) {
      if (until && candidate > until) return null
      return candidate
    }
    month++
    if (month > 12) {
      month = 1
      year++
    }
  }
  return null
}

function formatUntil(until: string): string {
  const ymd = parseYmd(until)
  if (!ymd) return until
  const date = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day))
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** Plain-English summary, e.g. "Repeats every Tuesday" or "Repeats on the first Friday of each month, until Dec 31, 2026". */
export function describeRecurrence(rule: RecurrenceRule): string {
  let base: string
  if (rule.freq === 'weekly') {
    const days = [...new Set(rule.weekdays)]
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_NAMES[d])
    if (days.length === 0) return 'Repeats weekly'
    const list = days.length === 1
      ? days[0]
      : `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`
    base = `Repeats every ${list}`
  } else {
    const ordinal = ORDINAL_NAMES[rule.week] ?? 'first'
    const weekday = WEEKDAY_NAMES[rule.weekday] ?? 'day'
    base = `Repeats on the ${ordinal} ${weekday} of each month`
  }
  if (typeof rule.until === 'string' && rule.until) {
    return `${base}, until ${formatUntil(rule.until)}`
  }
  return base
}

/** Short weekday label (Sun..Sat) for compact UI. */
export function shortWeekday(weekday: number): string {
  return WEEKDAY_SHORT[weekday] ?? ''
}

/** Validate/normalize an untrusted value into a RecurrenceRule, or null. */
export function parseRecurrenceRule(raw: unknown): RecurrenceRule | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const until = typeof obj.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.until) ? obj.until : null

  if (obj.freq === 'weekly') {
    if (!Array.isArray(obj.weekdays)) return null
    const weekdays = [...new Set(obj.weekdays)]
      .filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)
      .sort((a, b) => a - b)
    if (weekdays.length === 0) return null
    return { freq: 'weekly', weekdays, until }
  }

  if (obj.freq === 'monthly') {
    const week = obj.week
    const weekday = obj.weekday
    if (!Number.isInteger(week) || ([1, 2, 3, 4, -1] as unknown[]).indexOf(week) === -1) return null
    if (!Number.isInteger(weekday) || (weekday as number) < 0 || (weekday as number) > 6) return null
    return { freq: 'monthly', week: week as number, weekday: weekday as number, until }
  }

  return null
}
