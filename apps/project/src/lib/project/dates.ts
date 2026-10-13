import type { TaskStatus } from "@/lib/project/rules"

/**
 * A due date is a whole day, stored as "YYYY-MM-DD" and read in the reader's
 * own day, so the day picked on the calendar is the day shown everywhere.
 */

/** Today's date as the calendar shows it, "YYYY-MM-DD", in the reader's own day. */
export function todayKey(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Past its due day, or with a "Due by" time, past that moment: a task due
 * today by 3:00 PM is overdue from 3:00 PM (Tyler, 13 Oct 2026).
 */
export function isOverdue(dueDate: string | null, status: TaskStatus, dueAt: string | null = null, now = new Date()) {
  if (!dueDate || status === "done") return false
  return dueAt ? new Date(dueAt) < now : dueDate < todayKey(now)
}

/**
 * The day a task is due in the reader's own day. With a "Due by" time it is
 * the day that moment falls on for the reader, which can be a day either
 * side of the stored date for someone in another time zone.
 */
export function dueDayOf(task: { dueDate: string | null; dueAt?: string | null }) {
  return task.dueAt ? todayKey(new Date(task.dueAt)) : task.dueDate
}

/** "HH:MM" of a moment on the reader's own clock, for a time field. */
export function localTimeOf(at: string) {
  const date = new Date(at)
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

/** The moment "HH:MM" falls on a "YYYY-MM-DD" on the reader's own clock, as ISO. */
export function momentOnDay(day: string, time: string) {
  const [hour, minute] = time.split(":").map(Number)
  const date = dateFromKey(day)!
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
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
