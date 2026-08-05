import { z } from "zod"

import { formatClockTime, formatDateTime } from "@/lib/format-time"

/**
 * Drip sending: letting a newsletter out a few hundred at a time instead of
 * all at once.
 *
 * Sending twenty thousand identical emails in one go is what a blast machine
 * looks like from the receiving end, and mail servers treat it accordingly. So
 * the send goes out in chunks, waits a while between them, and only runs during
 * hours somebody actually chose.
 *
 * Everything here is pure and takes its clock as an argument, because the whole
 * point is behaviour that depends on what time it is — which is untestable if
 * the time comes from inside.
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

const timeSchema = z.string().regex(TIME_PATTERN)

const dripWindowSchema = z.object({
  start: timeSchema,
  end: timeSchema,
})

export type DripWindow = z.infer<typeof dripWindowSchema>

/**
 * A timezone the browser and the server both agree exists.
 *
 * Checked rather than held to a list, because the list on the settings screen is
 * a convenience, not the limit — a workspace in Berlin should not be told its
 * own timezone is invalid.
 */
const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isKnownTimezone, "That is not a timezone this server knows")

function isKnownTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const dripConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** People per chunk. A number is picked in this range for each chunk. */
  batchSizeMin: z.number().int().min(1).max(10_000).default(400),
  batchSizeMax: z.number().int().min(1).max(10_000).default(500),
  /** Minutes between chunks. Picked in this range each time, so it varies. */
  waitMinMinutes: z.number().int().min(1).max(1440).default(30),
  waitMaxMinutes: z.number().int().min(1).max(1440).default(60),
  /** Stop the send once this many out of 100 delivered addresses bounce. */
  bounceThresholdPercent: z.number().int().min(1).max(100).default(5),
  skipWeekends: z.boolean().default(false),
  /** Empty means any hour of the day. */
  windows: z.array(dripWindowSchema).max(2).default([]),
  timezone: timezoneSchema.default("America/New_York"),
})

export type DripConfig = z.infer<typeof dripConfigSchema>

/**
 * What a workspace that has never opened the settings gets.
 *
 * Off. An install that ignores this feature must send exactly as it did before
 * the feature existed, so every default here only matters once somebody has
 * deliberately turned the switch on.
 */
export const DEFAULT_DRIP_CONFIG: DripConfig = dripConfigSchema.parse({})

/** The zones offered on screen. Any other valid zone still saves. */
export const DRIP_TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "Europe/London", label: "London" },
  { value: "UTC", label: "UTC" },
] as const

function timezoneLabel(timezone: string): string {
  return (
    DRIP_TIMEZONE_OPTIONS.find((option) => option.value === timezone)?.label ??
    timezone
  )
}

/**
 * Reads a saved config back, falling back to "off" for anything unusable.
 *
 * Same shape of promise as `parseAudienceFilter`: the caller gets a config it
 * can trust, and a column written by an older version of this app — or by hand
 * — can never crash a send in flight. Falling back to off rather than to some
 * default pace matters: guessing a pace for a broken config would mean a send
 * quietly running to rules nobody chose.
 */
export function parseDripConfig(value: unknown): DripConfig {
  const parsed = dripConfigSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_DRIP_CONFIG
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number)
  return hours * 60 + minutes
}

/**
 * A number in the range, inclusive at both ends.
 *
 * Min and max are clamped rather than trusted. The settings screen refuses to
 * save a max below a min, but a config written before that check existed must
 * still pace a send rather than producing a negative batch size.
 */
function pickBetween(min: number, max: number, random: () => number): number {
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  const span = high - low + 1
  return low + Math.min(span - 1, Math.floor(random() * span))
}

export function pickBatchSize(
  config: DripConfig,
  random: () => number = Math.random
): number {
  return pickBetween(config.batchSizeMin, config.batchSizeMax, random)
}

export function pickWaitMs(
  config: DripConfig,
  random: () => number = Math.random
): number {
  return pickBetween(config.waitMinMinutes, config.waitMaxMinutes, random) * 60_000
}

/**
 * Formatters are built once per timezone and reused.
 *
 * `Intl.DateTimeFormat` is expensive to construct and this runs on every pass
 * of a fifteen-second ticker, for every broadcast in flight.
 */
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timezone)
  if (cached) return cached
  // `hourCycle: "h23"` rather than `hour12: false`, which is allowed to render
  // midnight as hour 24 and would put it a day out.
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone: isKnownTimezone(timezone) ? timezone : "UTC",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  formatters.set(timezone, created)
  return created
}

type WallClock = {
  year: number
  month: number
  day: number
  minutes: number
}

/** What a clock on the wall in that timezone reads at that moment. */
function wallClockAt(timezone: string, at: Date): WallClock {
  const parts = formatterFor(timezone).formatToParts(at)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0)
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    minutes: read("hour") * 60 + read("minute"),
  }
}

/** How far ahead of UTC that timezone is at that moment, in milliseconds. */
function offsetAt(timezone: string, at: Date): number {
  const parts = formatterFor(timezone).formatToParts(at)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0)
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second")
  )
  return asUtc - at.getTime()
}

/**
 * The real moment at which a wall clock in that timezone reads this date and
 * time.
 *
 * Guess that the wall time is UTC, ask what the offset is around then, and
 * correct by it — then ask again, because the correction can land on the far
 * side of a daylight-saving change and be off by an hour. This is the bit
 * `new Date(at.toLocaleString("en-US", { timeZone }))` gets wrong, and it gets
 * it wrong twice a year in the small hours, which is exactly when a newsletter
 * would be asleep waiting for its window.
 */
function wallClockToInstant(
  timezone: string,
  year: number,
  month: number,
  day: number,
  minutes: number
): Date {
  const asUtc = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minutes / 60),
    minutes % 60
  )
  const firstGuess = new Date(asUtc - offsetAt(timezone, new Date(asUtc)))
  const settled = offsetAt(timezone, firstGuess)
  return new Date(asUtc - settled)
}

function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6
}

/**
 * The weekday of a calendar date, worked out from the date itself rather than
 * from any timezone — the 4th of August is a Tuesday everywhere.
 */
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function isMinuteInWindow(minutes: number, window: DripWindow): boolean {
  const start = timeToMinutes(window.start)
  const end = timeToMinutes(window.end)
  // A window whose start and end are the same is meaningless. The settings
  // screen refuses to save one; if an older config has one, read it as "any
  // hour" rather than as "never", because never would strand a send for good.
  if (start === end) return true
  if (start < end) return minutes >= start && minutes < end
  // Wraps past midnight, e.g. 10pm to 2am.
  return minutes >= start || minutes < end
}

/** Whether a chunk may go out right now. */
export function isWithinDripWindow(config: DripConfig, at: Date): boolean {
  const clock = wallClockAt(config.timezone, at)
  if (
    config.skipWeekends &&
    isWeekend(weekdayOf(clock.year, clock.month, clock.day))
  ) {
    return false
  }
  if (config.windows.length === 0) return true
  return config.windows.some((window) => isMinuteInWindow(clock.minutes, window))
}

/** How many days ahead to look before giving up. Two weekends' worth. */
const WINDOW_SEARCH_DAYS = 9

/**
 * The exact next moment sending may start again.
 *
 * Worth the trouble of computing precisely rather than "try again in five
 * minutes": an overnight newsletter that keeps waking every five minutes gets
 * claimed, examined and released a hundred and forty times before morning, for
 * nothing. Pointing `next_batch_at` at the real opening means it is not looked
 * at again until then.
 */
export function nextDripWindowOpen(config: DripConfig, at: Date): Date {
  if (isWithinDripWindow(config, at)) return at

  const today = wallClockAt(config.timezone, at)
  let soonest: Date | null = null

  for (let dayOffset = 0; dayOffset <= WINDOW_SEARCH_DAYS; dayOffset += 1) {
    // Built through Date.UTC so the end of a month or a year rolls over on its
    // own; only the calendar date is taken back out.
    const date = new Date(
      Date.UTC(today.year, today.month - 1, today.day + dayOffset)
    )
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth() + 1
    const day = date.getUTCDate()

    if (config.skipWeekends && isWeekend(date.getUTCDay())) continue

    // No hours chosen means the only thing holding it back was the weekend, so
    // the moment that day begins is the moment it may go.
    const starts =
      config.windows.length === 0
        ? [0]
        : config.windows.map((window) => timeToMinutes(window.start))

    for (const minutes of starts) {
      const instant = wallClockToInstant(
        config.timezone,
        year,
        month,
        day,
        minutes
      )
      if (instant.getTime() <= at.getTime()) continue
      if (!soonest || instant.getTime() < soonest.getTime()) soonest = instant
    }
  }

  // Only reachable if every day for the next nine is somehow closed. Waking in
  // an hour is a better answer than never waking again.
  return soonest ?? new Date(at.getTime() + 60 * 60_000)
}

/** "08:00" as "8am". The sending-hours fields, not a moment in time. */
function formatWindowTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number)
  const period = hours >= 12 ? "pm" : "am"
  const display = hours % 12 || 12
  return minutes === 0
    ? `${display}${period}`
    : `${display}:${String(minutes).padStart(2, "0")}${period}`
}

/** The chosen hours in words, e.g. "8am–1pm and 7–9pm". */
export function describeDripWindows(config: DripConfig): string {
  if (config.windows.length === 0) return "any time of day"
  return config.windows
    .map(
      (window) =>
        `${formatWindowTime(window.start)}–${formatWindowTime(window.end)}`
    )
    .join(" and ")
}

/**
 * The whole pace in one plain sentence, shown under the fields so the numbers
 * add up to something a person can picture.
 */
export function describeDripSchedule(config: DripConfig): string {
  if (!config.enabled) return "Everyone gets it as fast as the server can send."

  const size =
    config.batchSizeMin === config.batchSizeMax
      ? `${config.batchSizeMin.toLocaleString()} people`
      : `${config.batchSizeMin.toLocaleString()}–${config.batchSizeMax.toLocaleString()} people`
  const wait =
    config.waitMinMinutes === config.waitMaxMinutes
      ? `${config.waitMinMinutes} minutes`
      : `${config.waitMinMinutes}–${config.waitMaxMinutes} minutes`
  const when =
    config.windows.length === 0
      ? "any time of day"
      : `${describeDripWindows(config)} ${timezoneLabel(config.timezone)} time`
  const days = config.skipWeekends ? ", weekdays only" : ""

  return `${size} at a time, ${wait} apart, ${when}${days}.`
}

/**
 * When the next batch goes, for a send that is between batches.
 *
 * Null when there is nothing to wait for, so the caller can leave the line out
 * entirely rather than showing an empty one. One wording whether it is waiting
 * out the gap between batches or waiting for the sending hours to open — the
 * time itself already tells the reader which, and two labels would be two
 * things to get wrong.
 */
export function describeNextBatch(nextBatchAt: string | null): string | null {
  if (!nextBatchAt) return null
  const at = new Date(nextBatchAt)
  if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) return null

  const within12Hours = at.getTime() - Date.now() < 12 * 60 * 60_000
  return `Next batch ${within12Hours ? "at " : ""}${
    within12Hours ? formatClockTime(at) : formatDateTime(at)
  }`
}

/**
 * Roughly how long the whole thing will take, for the send screen.
 *
 * Deliberately rough. It counts the waits between chunks and ignores closed
 * hours entirely, so it is a floor rather than a promise — saying "about 4
 * hours" and taking three days because of an overnight gap would be worse than
 * saying nothing, which is why the wording it feeds is "at least".
 */
export function estimateDripBatches(config: DripConfig, recipients: number) {
  const typicalSize = Math.max(
    1,
    Math.round((config.batchSizeMin + config.batchSizeMax) / 2)
  )
  const batches = Math.max(1, Math.ceil(recipients / typicalSize))
  const typicalWait = (config.waitMinMinutes + config.waitMaxMinutes) / 2
  return { batches, minutes: Math.round((batches - 1) * typicalWait) }
}

/**
 * What is wrong with these settings, or null if nothing is.
 *
 * One message at a time, because it is shown in a toast and a list of five
 * complaints is not more useful than the first one.
 */
export function validateDripConfig(config: DripConfig): string | null {
  if (!config.enabled) return null

  if (config.batchSizeMin > config.batchSizeMax) {
    return "Batch size: the smallest number cannot be bigger than the largest."
  }
  if (config.waitMinMinutes > config.waitMaxMinutes) {
    return "Wait between batches: the shortest wait cannot be longer than the longest."
  }
  for (const window of config.windows) {
    if (window.start === window.end) {
      return "Sending hours: a start and an end at the same time leave no time to send."
    }
  }
  return null
}
