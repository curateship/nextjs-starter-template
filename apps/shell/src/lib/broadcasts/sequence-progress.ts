/**
 * The one word shown for a person in a sequence, and for each of their emails.
 * First match wins, in Tyler's order (22 Nov 2026): Complained, Bounced,
 * Unsubscribed, Clicked, Opened, Delivered, Sent, then Failed and Waiting.
 */
const SEQUENCE_PERSON_STATUSES = [
  "complained",
  "bounced",
  "unsubscribed",
  "clicked",
  "opened",
  "delivered",
  "sent",
  "failed",
  "waiting",
] as const

export type SequencePersonStatus = (typeof SEQUENCE_PERSON_STATUSES)[number]

export const SEQUENCE_STATUS_LABELS: Record<SequencePersonStatus, string> = {
  complained: "Complained",
  bounced: "Bounced",
  unsubscribed: "Unsubscribed",
  clicked: "Clicked",
  opened: "Opened",
  delivered: "Delivered",
  sent: "Sent",
  failed: "Failed",
  waiting: "Waiting",
}

/**
 * Badge colours copied from the old Directory app's events list: the two
 * refusals red, unsubscribed yellow, opened green, clicked blue, the rest grey.
 */
export const SEQUENCE_STATUS_BADGE: Record<SequencePersonStatus, string> = {
  complained: "border-destructive/30 bg-destructive/10 text-destructive",
  bounced: "border-destructive/30 bg-destructive/10 text-destructive",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  unsubscribed: "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-300",
  opened: "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
  clicked: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  delivered: "",
  sent: "",
  waiting: "",
}

/** "48%" of what went, or a hyphen before anything has (no em dashes on screen). */
export function sequenceRate(count: number, sent: number) {
  return sent > 0 ? `${Math.round((count / sent) * 100)}%` : "-"
}

/** The grey line under an email: only the numbers that are not zero. */
export function sequenceEmailLine(stats: {
  sent: number
  opened: number
  clicked: number
  bounced: number
  complained: number
  unsubscribed: number
}) {
  if (stats.sent === 0) return "Not sent yet"
  return [
    `${stats.sent.toLocaleString("en-US")} sent`,
    stats.opened ? `${sequenceRate(stats.opened, stats.sent)} opened` : "",
    stats.clicked ? `${sequenceRate(stats.clicked, stats.sent)} clicked` : "",
    stats.bounced ? `${stats.bounced} bounced` : "",
    stats.complained ? `${stats.complained} complained` : "",
    stats.unsubscribed ? `${stats.unsubscribed} unsubscribed` : "",
  ]
    .filter(Boolean)
    .join(" · ")
}
