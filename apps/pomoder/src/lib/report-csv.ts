// Spreadsheet-safe CSV building for focus-history exports. Cells are quoted
// per RFC 4180 and cells that would be read as formulas get a leading
// apostrophe so spreadsheet apps keep them as plain text (CSV injection guard).

const QUOTE_REQUIRED = /[",\r\n]/
const FORMULA_PREFIX = /^[=+\-@\t\r]/

export function csvCell(value: string | number): string {
  let text = String(value)
  if (FORMULA_PREFIX.test(text)) text = `'${text}`
  if (QUOTE_REQUIRED.test(text)) text = `"${text.replaceAll('"', '""')}"`
  return text
}

export function buildCsv(rows: readonly (readonly (string | number)[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

export type FocusHistoryCsvRow = {
  localDate: string
  localTime: string
  taskTitle: string | null
  plannedSeconds: number
  accumulatedSeconds: number
}

export const FOCUS_HISTORY_CSV_HEADER = ["Date", "Completed at", "Task", "Planned minutes", "Focused minutes"] as const

function csvMinutes(seconds: number) {
  return Math.round(seconds / 6) / 10
}

export function buildFocusHistoryCsv(rows: readonly FocusHistoryCsvRow[]): string {
  return buildCsv([
    FOCUS_HISTORY_CSV_HEADER,
    ...rows.map((row) => [row.localDate, row.localTime, row.taskTitle ?? "No task", csvMinutes(row.plannedSeconds), csvMinutes(row.accumulatedSeconds)]),
  ])
}

// Local dates in the name make repeated exports of the same range stable and
// unambiguous regardless of the machine's timezone.
export function focusHistoryFileName(range: string, startDate: string, endDate: string) {
  return `pomoder-focus-${range}-${startDate}-to-${endDate}.csv`
}
