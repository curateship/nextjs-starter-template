/**
 * NYSE regular-session calendar: DST-aware New York wall-clock math plus the
 * exchange's published holiday and early-close schedule for 2020–2030.
 * Source: https://www.nyse.com/markets/hours-calendars — dates for 2027–2030
 * follow the published rules but are scheduled, not yet official.
 */

export type NyseSession = { openMs: number; closeMs: number }

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Full market closures ("YYYY-MM-DD" in New York time). Weekend holidays are
 * listed on their observed weekday (Saturday → Friday before, Sunday → Monday
 * after), except New Year's Day, which is not observed when Jan 1 falls on a
 * Saturday (so 2021-12-31 and 2027-12-31 are normal trading days).
 */
export const NYSE_FULL_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2020
  "2020-01-01", "2020-01-20", "2020-02-17", "2020-04-10", "2020-05-25",
  "2020-07-03", "2020-09-07", "2020-11-26", "2020-12-25",
  // 2021 (Christmas observed Fri Dec 24; New Year's 2022 not observed)
  "2021-01-01", "2021-01-18", "2021-02-15", "2021-04-02", "2021-05-31",
  "2021-07-05", "2021-09-06", "2021-11-25", "2021-12-24",
  // 2022 (first year NYSE observes Juneteenth; observed Mon Jun 20)
  "2022-01-17", "2022-02-21", "2022-04-15", "2022-05-30", "2022-06-20",
  "2022-07-04", "2022-09-05", "2022-11-24", "2022-12-26",
  // 2023
  "2023-01-02", "2023-01-16", "2023-02-20", "2023-04-07", "2023-05-29",
  "2023-06-19", "2023-07-04", "2023-09-04", "2023-11-23", "2023-12-25",
  // 2024
  "2024-01-01", "2024-01-15", "2024-02-19", "2024-03-29", "2024-05-27",
  "2024-06-19", "2024-07-04", "2024-09-02", "2024-11-28", "2024-12-25",
  // 2025 (Jan 9: National Day of Mourning for President Carter)
  "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18",
  "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27",
  "2025-12-25",
  // 2026 (Independence Day observed Fri Jul 3)
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027 (Juneteenth observed Fri Jun 18, July 4th observed Mon Jul 5,
  // Christmas observed Fri Dec 24; New Year's 2028 not observed)
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  // 2028
  "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19",
  "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25",
  // 2029
  "2029-01-01", "2029-01-15", "2029-02-19", "2029-03-30", "2029-05-28",
  "2029-06-19", "2029-07-04", "2029-09-03", "2029-11-22", "2029-12-25",
  // 2030
  "2030-01-01", "2030-01-21", "2030-02-18", "2030-04-19", "2030-05-27",
  "2030-06-19", "2030-07-04", "2030-09-02", "2030-11-28", "2030-12-25",
])

/**
 * 1:00 PM early closes: the day after Thanksgiving every year, plus Jul 3 and
 * Dec 24 when they are weekday trading days (not themselves observed holidays).
 */
export const NYSE_EARLY_CLOSES: ReadonlySet<string> = new Set([
  "2020-11-27", "2020-12-24",
  "2021-11-26",
  "2022-11-25",
  "2023-07-03", "2023-11-24",
  "2024-07-03", "2024-11-29", "2024-12-24",
  "2025-07-03", "2025-11-28", "2025-12-24",
  "2026-11-27", "2026-12-24",
  "2027-11-26",
  "2028-07-03", "2028-11-24",
  "2029-07-03", "2029-11-23", "2029-12-24",
  "2030-07-03", "2030-11-29", "2030-12-24",
])

const nyFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/** New York wall clock for a UTC instant. */
function nyClock(utcMs: number) {
  const parts: Record<string, number> = {}
  for (const part of nyFormat.formatToParts(utcMs)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value)
  }
  // hour12:false reports midnight as 24 in some engines.
  return { y: parts.year, m: parts.month, d: parts.day, hh: parts.hour % 24, mm: parts.minute }
}

/** UTC epoch ms for a New York wall-clock time (DST-aware). */
function nyWallToUtcMs(y: number, m: number, d: number, hh: number, mm: number): number {
  // Guess the instant assuming NY == UTC, then subtract the NY offset measured
  // at the guess. The guess is only 4–5 hours off, and session times (9:30,
  // 13:00, 16:00) never sit near the 2 AM DST switch, so one step is exact.
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  const clock = nyClock(wall)
  const wallAtGuess = Date.UTC(clock.y, clock.m - 1, clock.d, clock.hh, clock.mm)
  return wall - (wallAtGuess - wall)
}

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/**
 * NYSE regular sessions (9:30 AM – 4:00 PM New York, 1:00 PM on early-close
 * days) overlapping [fromMs, toMs], clipped to that range. Skips weekends and
 * full holidays.
 */
export function nyseSessionsInRange(fromMs: number, toMs: number): NyseSession[] {
  const sessions: NyseSession[] = []
  // Start one NY day early so a session already in progress at fromMs is kept.
  let { y, m, d } = nyClock(fromMs - DAY_MS)
  while (nyWallToUtcMs(y, m, d, 9, 30) <= toMs) {
    const key = dateKey(y, m, d)
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    if (weekday !== 0 && weekday !== 6 && !NYSE_FULL_HOLIDAYS.has(key)) {
      const openMs = Math.max(nyWallToUtcMs(y, m, d, 9, 30), fromMs)
      const closeHour = NYSE_EARLY_CLOSES.has(key) ? 13 : 16
      const closeMs = Math.min(nyWallToUtcMs(y, m, d, closeHour, 0), toMs)
      if (closeMs > openMs) sessions.push({ openMs, closeMs })
    }
    // Next NY calendar day (Date.UTC normalizes month/year rollover).
    const next = new Date(Date.UTC(y, m - 1, d + 1))
    y = next.getUTCFullYear()
    m = next.getUTCMonth() + 1
    d = next.getUTCDate()
  }
  return sessions
}
