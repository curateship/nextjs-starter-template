import type { AutomationSchedule } from './types'

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function defaultAutomationSchedule(): AutomationSchedule {
  return {
    frequency: 'weekly',
    time: '09:00',
    timezone: resolvedTimezone(),
    dayOfWeek: 1,
  }
}

export function validateAutomationSchedule(schedule: AutomationSchedule): string | null {
  if (!isValidTimezone(schedule.timezone)) return 'Choose a valid timezone.'

  if (schedule.frequency === 'once') {
    const runAt = new Date(schedule.runAt)
    return Number.isFinite(runAt.getTime()) ? null : 'Choose a valid run date and time.'
  }

  if (!TIME_PATTERN.test(schedule.time)) return 'Choose a valid time.'
  if (schedule.frequency === 'weekly' && (!Number.isInteger(schedule.dayOfWeek) || schedule.dayOfWeek < 0 || schedule.dayOfWeek > 6)) {
    return 'Choose a valid weekday.'
  }
  if (schedule.frequency === 'monthly' && (!Number.isInteger(schedule.dayOfMonth) || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31)) {
    return 'Choose a valid day of the month.'
  }
  return null
}

export function parseAutomationSchedule(value: unknown): AutomationSchedule {
  if (!isRecord(value)) throw new Error('Time node schedule is invalid')
  const frequency = value.frequency
  const timezone = boundedString(value.timezone, 'Time node timezone', 100)

  if (frequency === 'once') {
    return {
      frequency,
      runAt: boundedString(value.runAt, 'Time node run date', 100),
      timezone,
    }
  }

  if (frequency !== 'daily' && frequency !== 'weekly' && frequency !== 'monthly') {
    throw new Error('Time node frequency is invalid')
  }

  const time = boundedString(value.time, 'Time node time', 5)
  if (frequency === 'weekly') {
    return { frequency, time, timezone, dayOfWeek: requiredInteger(value.dayOfWeek, 'Time node weekday') }
  }
  if (frequency === 'monthly') {
    return { frequency, time, timezone, dayOfMonth: requiredInteger(value.dayOfMonth, 'Time node month day') }
  }
  return { frequency, time, timezone }
}

export function getNextAutomationRunAt(schedule: AutomationSchedule, after: Date = new Date()): Date | null {
  if (schedule.frequency === 'once') {
    const candidate = new Date(schedule.runAt)
    return Number.isFinite(candidate.getTime()) && candidate > after ? candidate : null
  }
  if (schedule.frequency === 'monthly') return getNextMonthlyRunAt(schedule, after)
  return getNextDailyOrWeeklyRunAt(schedule, after)
}

export function formatRunAtForTimezoneInput(runAt: string, timezone: string) {
  const date = new Date(runAt)
  if (!Number.isFinite(date.getTime()) || !isValidTimezone(timezone)) return ''
  const parts = getZonedParts(date, timezone)
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}T${parts.hour.toString().padStart(2, '0')}:${parts.minute.toString().padStart(2, '0')}`
}

export function runAtFromTimezoneInput(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match || !isValidTimezone(timezone)) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  const date = zonedTimeToUtc(year, month, day, hour, minute, timezone)
  const roundTrip = formatRunAtForTimezoneInput(date.toISOString(), timezone)
  return roundTrip === value ? date.toISOString() : null
}

function getNextDailyOrWeeklyRunAt(
  schedule: Extract<AutomationSchedule, { frequency: 'daily' | 'weekly' }>,
  after: Date
) {
  const start = getZonedParts(after, schedule.timezone)
  const [hour, minute] = schedule.time.split(':').map(Number)

  for (let offset = 0; offset <= 370; offset++) {
    const date = addUtcDays(start.year, start.month, start.day, offset)
    const weekday = getZonedWeekday(date.year, date.month, date.day, schedule.timezone)
    if (schedule.frequency === 'weekly' && weekday !== schedule.dayOfWeek) continue
    const candidate = zonedTimeToUtc(date.year, date.month, date.day, hour, minute, schedule.timezone)
    if (candidate > after) return candidate
  }
  return null
}

function getNextMonthlyRunAt(
  schedule: Extract<AutomationSchedule, { frequency: 'monthly' }>,
  after: Date
) {
  const start = getZonedParts(after, schedule.timezone)
  const [hour, minute] = schedule.time.split(':').map(Number)

  for (let offset = 0; offset <= 60; offset++) {
    const monthIndex = start.month - 1 + offset
    const year = start.year + Math.floor(monthIndex / 12)
    const month = (monthIndex % 12) + 1
    const day = Math.min(schedule.dayOfMonth, daysInMonth(year, month))
    const candidate = zonedTimeToUtc(year, month, day, hour, minute, schedule.timezone)
    if (candidate > after) return candidate
  }
  return null
}

function resolvedTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
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
    hourCycle: 'h23',
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
  return new Date(utcGuess.getTime() - (zonedAsUtc - utcGuess.getTime()))
}

function addUtcDays(year: number, month: number, day: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1, day + offset))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function getZonedWeekday(year: number, month: number, day: number, timezone: string) {
  const date = zonedTimeToUtc(year, month, day, 12, 0, timezone)
  const weekday = date.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short' })
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} is invalid`)
  return value
}

function requiredInteger(value: unknown, label: string) {
  if (!Number.isInteger(value)) throw new Error(`${label} is invalid`)
  return value as number
}
