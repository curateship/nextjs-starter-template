import { z } from "zod"

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_TIME_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

export const AUTOMATION_TIMEZONES = [
  "UTC",
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const

const timezoneSchema = z.enum(AUTOMATION_TIMEZONES)

const timeSchema = z.string().regex(TIME_PATTERN, "Choose a valid time.")

export const automationScheduleSchema = z.discriminatedUnion("frequency", [
  z.object({
    frequency: z.literal("once"),
    runAt: z
      .string()
      .max(100)
      .refine(
        (value) =>
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
          Number.isFinite(new Date(value).getTime()),
        {
          message: "Choose a valid run date and time.",
        }
      ),
    timezone: timezoneSchema,
  }),
  z.object({
    frequency: z.literal("daily"),
    time: timeSchema,
    timezone: timezoneSchema,
  }),
  z.object({
    frequency: z.literal("weekly"),
    time: timeSchema,
    timezone: timezoneSchema,
    dayOfWeek: z.number().int().min(0).max(6),
  }),
  z.object({
    frequency: z.literal("monthly"),
    time: timeSchema,
    timezone: timezoneSchema,
    dayOfMonth: z
      .number()
      .int("Day of month must be a whole number from 1 to 31.")
      .min(1, "Day of month must be a whole number from 1 to 31.")
      .max(31, "Day of month must be a whole number from 1 to 31."),
  }),
])

export type AutomationSchedule = z.infer<typeof automationScheduleSchema>
export type AutomationScheduleFrequency = AutomationSchedule["frequency"]
export type AutomationTimezone = (typeof AUTOMATION_TIMEZONES)[number]

export const AUTOMATION_FREQUENCY_LABELS: Record<
  AutomationScheduleFrequency,
  string
> = {
  once: "Once",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
}

export const AUTOMATION_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

export function defaultAutomationSchedule(): AutomationSchedule {
  return {
    frequency: "weekly",
    time: "09:00",
    timezone: resolvedTimezone(),
    dayOfWeek: 1,
  }
}

/** Reads a half-filled editor value without replacing what the person typed. */
export function readAutomationScheduleDraft(
  settings: Record<string, unknown>
): AutomationSchedule {
  const fallback = defaultAutomationSchedule()
  const value =
    typeof settings.schedule === "object" &&
    settings.schedule !== null &&
    !Array.isArray(settings.schedule)
      ? (settings.schedule as Record<string, unknown>)
      : {}
  const frequency = ["once", "daily", "weekly", "monthly"].includes(
    String(value.frequency)
  )
    ? (value.frequency as AutomationScheduleFrequency)
    : fallback.frequency
  const timezone =
    typeof value.timezone === "string" &&
    isValidAutomationTimezone(value.timezone)
      ? value.timezone
      : fallback.timezone
  if (frequency === "once") {
    return {
      frequency,
      timezone,
      runAt: typeof value.runAt === "string" ? value.runAt : "",
    }
  }
  const time = typeof value.time === "string" ? value.time : "09:00"
  if (frequency === "daily") return { frequency, timezone, time }
  if (frequency === "weekly") {
    return {
      frequency,
      timezone,
      time,
      dayOfWeek: typeof value.dayOfWeek === "number" ? value.dayOfWeek : 1,
    }
  }
  return {
    frequency,
    timezone,
    time,
    dayOfMonth: typeof value.dayOfMonth === "number" ? value.dayOfMonth : 1,
  }
}

export function readAutomationSchedule(
  settings: Record<string, unknown>
): AutomationSchedule | null {
  const parsed = automationScheduleSchema.safeParse(settings.schedule)
  return parsed.success ? parsed.data : null
}

export function changeAutomationScheduleFrequency(
  schedule: AutomationSchedule,
  frequency: AutomationScheduleFrequency,
  after: Date = new Date()
): AutomationSchedule {
  const timezone = schedule.timezone
  const time = schedule.frequency === "once" ? "09:00" : schedule.time
  if (frequency === "once") {
    return {
      frequency,
      timezone,
      runAt: new Date(after.getTime() + 60 * 60 * 1000).toISOString(),
    }
  }
  if (frequency === "daily") return { frequency, timezone, time }
  if (frequency === "weekly") {
    return { frequency, timezone, time, dayOfWeek: 1 }
  }
  return { frequency, timezone, time, dayOfMonth: 1 }
}

/** The first scheduled instant strictly after `after`. */
export function getNextAutomationRunAt(
  schedule: AutomationSchedule,
  after: Date = new Date()
): Date | null {
  if (schedule.frequency === "once") {
    const candidate = new Date(schedule.runAt)
    return Number.isFinite(candidate.getTime()) && candidate > after
      ? candidate
      : null
  }
  if (schedule.frequency === "monthly") {
    return getNextMonthlyRunAt(schedule, after)
  }
  return getNextDailyOrWeeklyRunAt(schedule, after)
}

export function formatRunAtForTimezoneInput(
  runAt: string,
  timezone: string
): string {
  if (DATE_TIME_INPUT_PATTERN.test(runAt)) return runAt
  const date = new Date(runAt)
  if (
    !Number.isFinite(date.getTime()) ||
    !isValidAutomationTimezone(timezone)
  ) {
    return ""
  }
  const parts = getZonedParts(date, timezone)
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

/** Keeps a one-time schedule's chosen wall-clock time when its zone changes. */
export function changeAutomationScheduleTimezone(
  schedule: AutomationSchedule,
  timezone: AutomationTimezone
): AutomationSchedule {
  if (schedule.frequency !== "once") return { ...schedule, timezone }
  const input = formatRunAtForTimezoneInput(schedule.runAt, schedule.timezone)
  return {
    ...schedule,
    timezone,
    runAt: runAtFromTimezoneInput(input, timezone) ?? schedule.runAt,
  }
}

export function runAtFromTimezoneInput(
  value: string,
  timezone: string
): string | null {
  const match = DATE_TIME_INPUT_PATTERN.exec(value)
  if (!match || !isValidAutomationTimezone(timezone)) return null
  const [, year, month, day, hour, minute] = match.map(Number)
  const date = zonedTimeToUtc(year, month, day, hour, minute, timezone)
  if (!date) return null
  return formatRunAtForTimezoneInput(date.toISOString(), timezone) === value
    ? date.toISOString()
    : null
}

export function isValidAutomationTimezone(
  timezone: string
): timezone is AutomationTimezone {
  return timezoneSchema.safeParse(timezone).success
}

export function formatAutomationSchedule(schedule: AutomationSchedule): string {
  if (schedule.frequency === "once") {
    return `Once · ${formatScheduledInstant(new Date(schedule.runAt), schedule.timezone)}`
  }
  if (schedule.frequency === "daily") return `Daily · ${schedule.time}`
  if (schedule.frequency === "weekly") {
    return `${AUTOMATION_WEEKDAYS[schedule.dayOfWeek]} · ${schedule.time}`
  }
  return `Monthly, day ${schedule.dayOfMonth} · ${schedule.time}`
}

export function formatScheduledInstant(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date)
}

function getNextDailyOrWeeklyRunAt(
  schedule: Extract<AutomationSchedule, { frequency: "daily" | "weekly" }>,
  after: Date
): Date | null {
  const start = getZonedParts(after, schedule.timezone)
  const [hour, minute] = schedule.time.split(":").map(Number)

  for (let offset = 0; offset <= 370; offset += 1) {
    const date = addUtcDays(start.year, start.month, start.day, offset)
    if (
      schedule.frequency === "weekly" &&
      getZonedWeekday(date.year, date.month, date.day, schedule.timezone) !==
        schedule.dayOfWeek
    ) {
      continue
    }
    const candidate = zonedTimeToUtc(
      date.year,
      date.month,
      date.day,
      hour,
      minute,
      schedule.timezone
    )
    // A local time inside the spring-forward gap does not exist. Skip that
    // occurrence instead of silently moving it to a different wall-clock time.
    if (candidate && candidate > after) return candidate
  }
  return null
}

function getNextMonthlyRunAt(
  schedule: Extract<AutomationSchedule, { frequency: "monthly" }>,
  after: Date
): Date | null {
  const start = getZonedParts(after, schedule.timezone)
  const [hour, minute] = schedule.time.split(":").map(Number)

  for (let offset = 0; offset <= 60; offset += 1) {
    const monthIndex = start.month - 1 + offset
    const year = start.year + Math.floor(monthIndex / 12)
    const month = (monthIndex % 12) + 1
    const day = Math.min(schedule.dayOfMonth, daysInMonth(year, month))
    const candidate = zonedTimeToUtc(
      year,
      month,
      day,
      hour,
      minute,
      schedule.timezone
    )
    if (candidate && candidate > after) return candidate
  }
  return null
}

function resolvedTimezone(): AutomationTimezone {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidAutomationTimezone(timezone) ? timezone : "UTC"
  } catch {
    return "UTC"
  }
}

function getFormatter(timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
}

function getZonedParts(date: Date, timezone: string) {
  const parts = getFormatter(timezone).formatToParts(date)
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

/**
 * Resolves a local wall-clock time to its earliest real instant.
 *
 * Sampling offsets on both sides of the date covers a daylight-saving change.
 * A missing spring-forward time returns null; an ambiguous fall-back time uses
 * its first occurrence, so one local schedule never fires twice that day.
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date | null {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  const sampleDistance = 36 * 60 * 60 * 1000
  const offsets = new Set(
    [-sampleDistance, 0, sampleDistance].map((distance) =>
      timezoneOffsetAt(new Date(guess + distance), timezone)
    )
  )
  const matches = [...offsets]
    .map((offset) => new Date(guess - offset))
    .filter((candidate) => {
      const parts = getZonedParts(candidate, timezone)
      return (
        parts.year === year &&
        parts.month === month &&
        parts.day === day &&
        parts.hour === hour &&
        parts.minute === minute
      )
    })
    .sort((left, right) => left.getTime() - right.getTime())
  return matches[0] ?? null
}

function timezoneOffsetAt(date: Date, timezone: string): number {
  const parts = getZonedParts(date, timezone)
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    ) - date.getTime()
  )
}

function addUtcDays(year: number, month: number, day: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1, day + offset))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function getZonedWeekday(
  year: number,
  month: number,
  day: number,
  timezone: string
): number {
  const date = zonedTimeToUtc(year, month, day, 12, 0, timezone)
  if (!date) return -1
  const weekday = date.toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "short",
  })
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday)
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0")
}
