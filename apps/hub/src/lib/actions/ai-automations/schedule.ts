export type AiAutomationFrequency = 'daily' | 'weekly' | 'monthly'

export interface AiAutomationRecurrence {
  frequency: AiAutomationFrequency
  time: string
  timezone: string
  dayOfWeek?: number
  dayOfMonth?: number
}

const DEFAULT_TIMEZONE = 'UTC'
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isAiAutomationFrequency(value: unknown): value is AiAutomationFrequency {
  return value === 'daily' || value === 'weekly' || value === 'monthly'
}

export function normalizeAiAutomationRecurrence(value: unknown): AiAutomationRecurrence {
  const input = isRecord(value) ? value : {}
  const frequency = isAiAutomationFrequency(input.frequency) ? input.frequency : 'weekly'
  const time = typeof input.time === 'string' && TIME_PATTERN.test(input.time) ? input.time : '09:00'
  const requestedTimezone = typeof input.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : DEFAULT_TIMEZONE
  const timezone = isValidTimezone(requestedTimezone) ? requestedTimezone : DEFAULT_TIMEZONE

  return {
    frequency,
    time,
    timezone,
    dayOfWeek: clampInteger(input.dayOfWeek, 0, 6, 1),
    dayOfMonth: clampInteger(input.dayOfMonth, 1, 31, 1),
  }
}

export function getNextAiAutomationRunAt(
  recurrenceInput: unknown,
  after: Date = new Date()
): Date | null {
  const recurrence = normalizeAiAutomationRecurrence(recurrenceInput)

  if (recurrence.frequency === 'monthly') {
    return getNextMonthlyRunAt(recurrence, after)
  }

  return getNextDailyOrWeeklyRunAt(recurrence, after)
}

function getNextDailyOrWeeklyRunAt(recurrence: AiAutomationRecurrence, after: Date) {
  const start = getZonedParts(after, recurrence.timezone)
  const [hour, minute] = recurrence.time.split(':').map(Number)

  for (let offset = 0; offset <= 370; offset++) {
    const date = addUtcDays(start.year, start.month, start.day, offset)
    const dayOfWeek = getZonedWeekday(date.year, date.month, date.day, recurrence.timezone)
    if (recurrence.frequency === 'weekly' && dayOfWeek !== recurrence.dayOfWeek) continue

    const candidate = zonedTimeToUtc(date.year, date.month, date.day, hour, minute, recurrence.timezone)
    if (candidate > after) return candidate
  }

  return null
}

function getNextMonthlyRunAt(recurrence: AiAutomationRecurrence, after: Date) {
  const start = getZonedParts(after, recurrence.timezone)
  const [hour, minute] = recurrence.time.split(':').map(Number)

  for (let offset = 0; offset <= 60; offset++) {
    const monthIndex = start.month - 1 + offset
    const year = start.year + Math.floor(monthIndex / 12)
    const month = (monthIndex % 12) + 1
    const day = Math.min(recurrence.dayOfMonth ?? 1, daysInMonth(year, month))
    const candidate = zonedTimeToUtc(year, month, day, hour, minute, recurrence.timezone)
    if (candidate > after) return candidate
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.floor(numeric)))
}

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
    return true
  } catch {
    return false
  }
}

function getFormatter(timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function getZonedParts(date: Date, timezone: string) {
  const parts = getFormatter(timezone).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))
  const parts = getZonedParts(utcGuess, timezone)
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  const offsetMs = zonedAsUtc - utcGuess.getTime()
  return new Date(utcGuess.getTime() - offsetMs)
}

function addUtcDays(year: number, month: number, day: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1, day + offset, 0, 0, 0, 0))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function getZonedWeekday(year: number, month: number, day: number, timezone: string) {
  const date = zonedTimeToUtc(year, month, day, 12, 0, timezone)
  return getWeekdayNumber(date, timezone)
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function getWeekdayNumber(date: Date, timezone: string) {
  const weekday = date.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short' })
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)
}
