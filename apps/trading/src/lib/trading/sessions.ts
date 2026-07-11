/**
 * Pickable chart sessions for the "Sessions" overlay indicator: real exchange
 * hours (New York via the NYSE calendar, Tokyo, London) plus the fixed UTC
 * blocks crypto desks use. One session is drawn at a time.
 */

import { nyseSessionsInRange } from "./nyse-sessions"

export type SessionSpan = { openMs: number; closeMs: number }

export type SessionKey =
  | "nyse"
  | "tokyo"
  | "london"
  | "utcAsia"
  | "utcLondon"
  | "utcNewYork"

export const SESSION_OPTIONS: { value: SessionKey; label: string }[] = [
  { value: "nyse", label: "New York — NYSE 9:30–16:00" },
  { value: "tokyo", label: "Tokyo — 9:00–15:00 JST" },
  { value: "london", label: "London — 8:00–16:30 UK" },
  { value: "utcAsia", label: "Crypto Asia — 00:00–08:00 UTC" },
  { value: "utcLondon", label: "Crypto London — 08:00–16:00 UTC" },
  { value: "utcNewYork", label: "Crypto New York — 13:00–21:00 UTC" },
]

export function isSessionKey(value: unknown): value is SessionKey {
  return SESSION_OPTIONS.some((option) => option.value === value)
}

export function sessionLabel(key: SessionKey): string {
  return SESSION_OPTIONS.find((option) => option.value === key)?.label ?? key
}

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/**
 * Exchange hours as a local wall clock. No holiday calendar for Tokyo/London
 * (accepted simplification); New York keeps the full NYSE calendar via
 * `nyse-sessions.ts`.
 */
type WallClockDef = {
  timeZone: string
  open: { hh: number; mm: number }
  close: { hh: number; mm: number }
}

const WALL_CLOCK_DEFS: Record<"tokyo" | "london", WallClockDef> = {
  tokyo: {
    timeZone: "Asia/Tokyo",
    open: { hh: 9, mm: 0 },
    close: { hh: 15, mm: 0 },
  },
  london: {
    timeZone: "Europe/London",
    open: { hh: 8, mm: 0 },
    close: { hh: 16, mm: 30 },
  },
}

const zoneFormats = new Map<string, Intl.DateTimeFormat>()

function zoneFormat(timeZone: string): Intl.DateTimeFormat {
  let format = zoneFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    zoneFormats.set(timeZone, format)
  }
  return format
}

/** Local wall clock for a UTC instant (same technique as nyse-sessions). */
function zoneClock(timeZone: string, utcMs: number) {
  const parts: Record<string, number> = {}
  for (const part of zoneFormat(timeZone).formatToParts(utcMs)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value)
  }
  // hour12:false reports midnight as 24 in some engines.
  return { y: parts.year, m: parts.month, d: parts.day, hh: parts.hour % 24, mm: parts.minute }
}

/**
 * UTC epoch ms for a local wall-clock time (DST-aware guess-and-correct, as in
 * nyse-sessions). Session times never sit near a DST switch (UK/US shift at
 * 1–2 AM local; Japan has no DST), so one correction step is exact.
 */
function wallToUtcMs(
  timeZone: string,
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number
): number {
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  const clock = zoneClock(timeZone, wall)
  const wallAtGuess = Date.UTC(clock.y, clock.m - 1, clock.d, clock.hh, clock.mm)
  return wall - (wallAtGuess - wall)
}

/** Weekday sessions for an exchange wall clock, clipped to [fromMs, toMs]. */
function wallClockSessionsInRange(
  def: WallClockDef,
  fromMs: number,
  toMs: number
): SessionSpan[] {
  const sessions: SessionSpan[] = []
  // Start one local day early so a session already in progress at fromMs is kept.
  let { y, m, d } = zoneClock(def.timeZone, fromMs - DAY_MS)
  while (wallToUtcMs(def.timeZone, y, m, d, def.open.hh, def.open.mm) <= toMs) {
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    if (weekday !== 0 && weekday !== 6) {
      const openMs = Math.max(
        wallToUtcMs(def.timeZone, y, m, d, def.open.hh, def.open.mm),
        fromMs
      )
      const closeMs = Math.min(
        wallToUtcMs(def.timeZone, y, m, d, def.close.hh, def.close.mm),
        toMs
      )
      if (closeMs > openMs) sessions.push({ openMs, closeMs })
    }
    // Next local calendar day (Date.UTC normalizes month/year rollover).
    const next = new Date(Date.UTC(y, m - 1, d + 1))
    y = next.getUTCFullYear()
    m = next.getUTCMonth() + 1
    d = next.getUTCDate()
  }
  return sessions
}

/**
 * Fixed daily UTC blocks, clipped to [fromMs, toMs]. Includes weekends —
 * crypto trades 24/7.
 */
function utcBlockSessionsInRange(
  openHour: number,
  closeHour: number,
  fromMs: number,
  toMs: number
): SessionSpan[] {
  const sessions: SessionSpan[] = []
  let day = Math.floor(fromMs / DAY_MS) * DAY_MS - DAY_MS
  while (day + openHour * HOUR_MS <= toMs) {
    const openMs = Math.max(day + openHour * HOUR_MS, fromMs)
    const closeMs = Math.min(day + closeHour * HOUR_MS, toMs)
    if (closeMs > openMs) sessions.push({ openMs, closeMs })
    day += DAY_MS
  }
  return sessions
}

/** Sessions of the picked kind overlapping [fromMs, toMs], clipped to it. */
export function sessionsInRange(
  key: SessionKey,
  fromMs: number,
  toMs: number
): SessionSpan[] {
  switch (key) {
    case "nyse":
      return nyseSessionsInRange(fromMs, toMs)
    case "tokyo":
      return wallClockSessionsInRange(WALL_CLOCK_DEFS.tokyo, fromMs, toMs)
    case "london":
      return wallClockSessionsInRange(WALL_CLOCK_DEFS.london, fromMs, toMs)
    case "utcAsia":
      return utcBlockSessionsInRange(0, 8, fromMs, toMs)
    case "utcLondon":
      return utcBlockSessionsInRange(8, 16, fromMs, toMs)
    case "utcNewYork":
      return utcBlockSessionsInRange(13, 21, fromMs, toMs)
  }
}
