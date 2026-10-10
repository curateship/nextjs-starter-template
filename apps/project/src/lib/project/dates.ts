import type { TaskStatus } from "@/lib/project/rules"

/**
 * A due date is a whole day, stored as "YYYY-MM-DD" and read in the reader's
 * own day, so the day picked on the calendar is the day shown everywhere.
 */

/** Today's date as the calendar shows it, "YYYY-MM-DD", in the reader's own day. */
function todayKey(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

export function isOverdue(dueDate: string | null, status: TaskStatus) {
  return Boolean(dueDate) && status !== "done" && (dueDate as string) < todayKey()
}

/** "YYYY-MM-DD" ↔ the date picker's Date, both in the reader's own day. */
export function dateFromKey(key: string | null) {
  if (!key) return undefined
  const [year, month, day] = key.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function keyFromDate(date: Date | undefined) {
  return date ? todayKey(date) : null
}
