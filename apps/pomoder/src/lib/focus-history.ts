// Client-safe focus-history contract shared by the History page and the
// server report module. Keep this file free of server imports.

export const reportRanges = ["7d", "30d", "12m", "year"] as const

export type ReportRange = (typeof reportRanges)[number]

export const reportRangeLabels: Record<ReportRange, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "12m": "12 months",
  year: "This year",
}

// Long-range reports are the paid tier; 7- and 30-day reports are free.
export function isLongRangeReport(range: ReportRange) {
  return range === "12m" || range === "year"
}

function parseLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error("INVALID_LOCAL_DATE")
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

function formatUtcParts(year: number, monthIndex: number, day: number) {
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, monthIndex, day)
  return date.toISOString().slice(0, 10)
}

export function shiftLocalDate(value: string, days: number) {
  const { year, month, day } = parseLocalDate(value)
  return formatUtcParts(year, month - 1, day + days)
}

// Every report range resolves to bounded, timezone-local calendar dates. The
// widest possible range is one leap year, so no request can scan unbounded
// history.
export function resolveReportRange(range: ReportRange, todayLocalDate: string) {
  const { year, month } = parseLocalDate(todayLocalDate)
  switch (range) {
    case "7d":
      return { startDate: shiftLocalDate(todayLocalDate, -6), endDate: todayLocalDate }
    case "30d":
      return { startDate: shiftLocalDate(todayLocalDate, -29), endDate: todayLocalDate }
    case "12m":
      return { startDate: formatUtcParts(year, month - 12, 1), endDate: todayLocalDate }
    case "year":
      return { startDate: formatUtcParts(year, 0, 1), endDate: todayLocalDate }
  }
}

export function formatFocusDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m`
}
