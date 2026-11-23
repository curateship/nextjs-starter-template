/**
 * The one clock the chart is on.
 *
 * Every time in this app is stored as epoch milliseconds and nothing here
 * changes that. A timezone is a way of READING those milliseconds — what the
 * axis labels say, what the crosshair says, and when a trading session starts —
 * and it is picked once, in the chart's View options, so those three can never
 * disagree with each other.
 *
 * **Wall clock plus a zone, never a fixed offset.** New York opens at 09:30 New
 * York time all year round; against UTC that is 13:30 for half the year and
 * 14:30 for the other half. A session stored as "13:30 UTC" would be right in
 * summer and an hour out every winter, which is worse than no session at all.
 * So the zone is stored by name and the offset is worked out per day.
 */

/**
 * The zones somebody would actually chart against, and what to call them.
 *
 * Short on purpose. The browser knows six hundred zone names and none of the
 * other five hundred and ninety are a trading day.
 */
export const TRADING_ZONES = [
  { id: "UTC", label: "UTC" },
  { id: "America/New_York", label: "New York" },
  { id: "America/Chicago", label: "Chicago" },
  { id: "Europe/London", label: "London" },
  { id: "Europe/Frankfurt", label: "Frankfurt" },
  { id: "Asia/Dubai", label: "Dubai" },
  { id: "Asia/Hong_Kong", label: "Hong Kong" },
  { id: "Asia/Tokyo", label: "Tokyo" },
  { id: "Australia/Sydney", label: "Sydney" },
] as const

export type TradingZoneId = (typeof TRADING_ZONES)[number]["id"]

/** What the chart reads before anybody picks. Every stored time already is. */
export const DEFAULT_TRADING_ZONE: TradingZoneId = "UTC"

/** What to call a zone on screen; its own name if it is not one of ours. */
export function tradingZoneLabel(zone: string): string {
  return TRADING_ZONES.find((one) => one.id === zone)?.label ?? zone
}

/**
 * A stored zone as a zone this build can use.
 *
 * Two ways it can fail and both fall back to UTC rather than throw: a name
 * this build no longer offers, and a name this browser's own clock tables have
 * never heard of. A chart on the wrong clock is a bug; a chart that will not
 * draw is a broken app.
 */
export function readTradingZone(value: unknown): TradingZoneId {
  const named = TRADING_ZONES.find((one) => one.id === value)
  if (!named) return DEFAULT_TRADING_ZONE
  return knownToTheBrowser(named.id) ? named.id : DEFAULT_TRADING_ZONE
}

const usable = new Map<string, boolean>()

function knownToTheBrowser(zone: string): boolean {
  const seen = usable.get(zone)
  if (seen !== undefined) return seen
  let works = true
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone })
  } catch {
    works = false
  }
  usable.set(zone, works)
  return works
}

const parters = new Map<string, Intl.DateTimeFormat>()

function parterFor(zone: string): Intl.DateTimeFormat {
  const held = parters.get(zone)
  if (held) return held
  const made = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
  parters.set(zone, made)
  return made
}

/** How far this zone's clock is ahead of UTC at this moment, in minutes. */
function probeOffset(zone: string, at: number): number {
  const parts = parterFor(zone).formatToParts(new Date(at))
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0")
  const asIfUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute")
  )
  // The probe reads whole minutes, so the moment it is measured from has to be
  // rounded the same way or every answer is out by the stray seconds.
  return Math.round((asIfUtc - Math.floor(at / 60_000) * 60_000) / 60_000)
}

const DAY_MS = 86_400_000

/**
 * A day's offset when it held all day, and null when the clock moved that day.
 *
 * **Why a cache at all.** The opening-range indicator asks for the local time
 * of every candle on the chart, and asking the browser's clock tables is not a
 * free call. A zone's offset changes twice a year, so almost every UTC day has
 * one answer for the whole day: probe both ends, and when they match the whole
 * day is that. Only the two changeover days a year fall through to a probe per
 * candle, and those stay exact.
 */
const settledDays = new Map<string, number | null>()

/** Ten years of days across a few zones, past which it starts over. */
const MOST_DAYS_REMEMBERED = 20_000

/** How far this zone's clock is ahead of UTC at this moment, in minutes. */
export function zoneOffsetMinutes(zone: string, at: number): number {
  if (!knownToTheBrowser(zone)) return 0
  const day = Math.floor(at / DAY_MS)
  const key = `${zone}:${day}`
  let settled = settledDays.get(key)
  if (settled === undefined) {
    const opened = probeOffset(zone, day * DAY_MS)
    const shut = probeOffset(zone, day * DAY_MS + DAY_MS - 1)
    settled = opened === shut ? opened : null
    if (settledDays.size >= MOST_DAYS_REMEMBERED) settledDays.clear()
    settledDays.set(key, settled)
  }
  return settled ?? probeOffset(zone, at)
}

/** A moment as this zone's own calendar and clock. */
export type ZoneTime = {
  year: number
  /** 1 to 12. */
  month: number
  /** 1 to 31. */
  day: number
  /** Minutes since local midnight — 09:30 is 570. */
  minuteOfDay: number
}

/** What this moment reads as on this zone's clock. */
export function zoneTimeAt(zone: string, at: number): ZoneTime {
  const local = new Date(at + zoneOffsetMinutes(zone, at) * 60_000)
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    minuteOfDay: local.getUTCHours() * 60 + local.getUTCMinutes(),
  }
}

/**
 * Which local day a moment falls on, as one comparable number — 20260821.
 *
 * A number rather than a date so "is this a different day from the candle
 * before?" is one comparison, which is what a session indicator asks once per
 * candle. Takes the local time rather than the moment, so a caller that has
 * already worked one out does not pay for it twice.
 */
export function zoneDayKeyOf(local: ZoneTime): number {
  return local.year * 10_000 + local.month * 100 + local.day
}

/** "09:30" and the like as minutes past local midnight, or null if it is not. */
export function minutesOfClockTime(value: string): number | null {
  const parts = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!parts) return null
  const hours = Number(parts[1])
  const minutes = Number(parts[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/** Minutes past midnight back as "09:30". */
export function clockTimeOfMinutes(minutes: number): string {
  const held = Math.min(Math.max(Math.round(minutes), 0), 1_439)
  const hours = Math.floor(held / 60)
  return `${String(hours).padStart(2, "0")}:${String(held % 60).padStart(2, "0")}`
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/**
 * What the chart's time axis writes under a candle.
 *
 * The library asks for one of four shapes as it thins the labels out on zoom,
 * and it hands the shape in. Built from `zoneTimeAt` rather than a second
 * formatter, so a label and a session boundary can only ever be reading the
 * same clock.
 */
export function zoneAxisLabel(
  zone: string,
  at: number,
  shape: "year" | "month" | "day" | "time"
): string {
  const local = zoneTimeAt(zone, at)
  if (shape === "year") return String(local.year)
  if (shape === "month") return MONTHS[local.month - 1]
  if (shape === "day") return String(local.day)
  return clockTimeOfMinutes(local.minuteOfDay)
}

/** What the crosshair writes on the axis: the whole moment, on this clock. */
export function zoneCrosshairLabel(zone: string, at: number): string {
  const local = zoneTimeAt(zone, at)
  return `${local.day} ${MONTHS[local.month - 1]} '${String(local.year).slice(2)} ${clockTimeOfMinutes(local.minuteOfDay)}`
}
