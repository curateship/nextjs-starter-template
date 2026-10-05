import { daysBetween } from "@/lib/format/format-time"

/**
 * When a conversation last moved, in the few characters an inbox row has for
 * it: "now", "18m", "3h", "Yesterday", "Mon", "Sep 28", "Sep 28, 2025".
 *
 * Every mail client does it this way, and the reason is width. The row already
 * holds a name, a subject and a line of the message; "18 minutes ago" would
 * take the space the subject needs, and nobody reading an inbox wants the
 * precision anyway.
 *
 * `at` is only ever passed by the tests. Reading the clock inside makes this
 * untestable, and passing it in from every call site would be noise.
 */
export function formatInboxTime(
  value: string | Date | null,
  at: Date = new Date()
): string {
  if (!value) return ""
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ""

  const elapsed = at.getTime() - date.getTime()
  const minutes = Math.floor(elapsed / 60_000)

  // Anything dated ahead of this clock reads as now rather than as a negative
  // number of minutes. Clocks disagree by a few seconds all the time.
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`

  const days = daysBetween(date, at)
  if (days === 0) return `${Math.floor(minutes / 60)}h`
  if (days === 1) return "Yesterday"
  // Inside the last week the weekday is enough, and it is what somebody
  // actually remembers: "she wrote on Monday".
  if (days < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date)
  }

  const sameYear = date.getFullYear() === at.getFullYear()
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date)
}

/**
 * The two letters in the circle beside a conversation.
 *
 * A name gives its first and last initial, a one-word name gives its first two
 * letters, and an address with no name behind it falls back to the start of
 * the part before the @. Never a question mark: every lead has an address, so
 * there is always something to show.
 */
export function initialsFor(
  name: string | null | undefined,
  email: string
): string {
  const words = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word))

  if (words.length >= 2) {
    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase()
  }

  const local = email.split("@")[0].replace(/[^a-z0-9]/gi, "")
  return (local.slice(0, 2) || email.slice(0, 2)).toUpperCase()
}
