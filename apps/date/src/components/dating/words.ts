import { formatClockTime } from "@/lib/format/format-time"
import type { SwipeDecision } from "@/lib/dating/options"

/**
 * How the Dating screens say a time: the clock for today, "Yesterday" and the
 * clock, or the day and month, in the reader's own time zone.
 */
export function whenWords(value: Date | string | null): string {
  if (!value) return ""
  const at = typeof value === "string" ? new Date(value) : value
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (at.getTime() >= startOfToday) return formatClockTime(at)
  if (at.getTime() >= startOfToday - 86_400_000) return `Yesterday ${formatClockTime(at)}`
  return `${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${formatClockTime(at)}`
}

export function nameAndAge(name: string, age: number | null): string {
  return age ? `${name}, ${age}` : name
}

export function swipeWords(swipe: SwipeDecision, by: "member" | "ai" | null): string {
  if (swipe === "none") return "Not swiped"
  const done = swipe === "super" ? "Super Liked" : swipe === "like" ? "Liked" : "Passed"
  return `${done} by ${by === "ai" ? "the AI" : "you"}`
}

export function dollars(value: number): string {
  return value < 10 ? `$${value.toFixed(2)}` : `$${Math.round(value)}`
}

/** A date's day and time, such as "Sat 3 Jan, 19:00", in the reader's own time zone. */
export function dateTimeWords(value: Date | string): string {
  const at = typeof value === "string" ? new Date(value) : value
  return `${at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${formatClockTime(at)}`
}
