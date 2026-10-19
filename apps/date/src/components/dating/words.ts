import { formatClockTime } from "@/lib/format/format-time"

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

export function swipeWords(swipe: "none" | "like" | "pass", by: "member" | "ai" | null): string {
  if (swipe === "none") return "Not swiped"
  return `${swipe === "like" ? "Liked" : "Passed"} by ${by === "ai" ? "the AI" : "you"}`
}

export function dollars(value: number): string {
  return value < 10 ? `$${value.toFixed(2)}` : `$${Math.round(value)}`
}
