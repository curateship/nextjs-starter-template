import {
  notificationTypeLabels,
  type NotificationType,
} from "@/lib/notification-types"

/**
 * The two controls above the Overview's activity feed, and every rule about
 * what they leave on screen.
 *
 * It sits apart from the feed because it is arithmetic, not drawing: which
 * rows survive a setting is the whole behaviour of the card and it should be
 * possible to check it without rendering anything.
 */

/** How far back the dated part of the feed reaches. */
export type ActivityRange = 7 | 30

export const ACTIVITY_RANGES: { value: ActivityRange; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
]

export const DEFAULT_ACTIVITY_RANGE: ActivityRange = 7

/**
 * What the feed is filtered down to. The three words come first because they
 * are the three most people want; the rest are the kinds of notice, named the
 * way the notifications table names them so the two can never drift.
 *
 * "Urgent" is the one it opens on, so the first thing on the dashboard is
 * whatever is waiting rather than whatever happened to be posted last.
 */
export type ActivityFilter = "urgent" | "unread" | "all" | NotificationType

export const DEFAULT_ACTIVITY_FILTER: ActivityFilter = "urgent"

export const ACTIVITY_FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "unread", label: "Unread" },
  { value: "all", label: "Everything" },
  ...(Object.keys(notificationTypeLabels) as NotificationType[]).map(
    (type) => ({ value: type, label: notificationTypeLabels[type] })
  ),
]

/**
 * Whether the urgent rows belong on screen under this setting.
 *
 * On "Urgent" because that is what was asked for, and on "Everything" because
 * everything means everything. Not on a single kind of notice, and not on
 * "Unread" — an urgent row is a condition, and a condition is never something
 * you have or have not opened.
 */
export function showsUrgent(filter: ActivityFilter) {
  return filter === "urgent" || filter === "all"
}

/**
 * Whether the dated notices belong on screen — and so whether the 7 / 30 day
 * tabs have anything at all to act on. "Urgent" is the one setting with no
 * dated rows under it.
 */
export function showsDatedActivity(filter: ActivityFilter) {
  return filter !== "urgent"
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The least a row must carry for the rules above to judge it. */
export type ActivityRow = {
  type: NotificationType
  read: boolean
  createdAt: Date
}

/**
 * The notices left after both controls have had their say, in the order they
 * arrived in.
 *
 * `now` is passed in rather than read here so one render cannot put a row in
 * one day's group and count it in another's — and so a test can say what time
 * it is.
 */
export function keepShownActivity<Row extends ActivityRow>(
  rows: Row[],
  filter: ActivityFilter,
  range: ActivityRange,
  now: Date
): Row[] {
  if (!showsDatedActivity(filter)) return []

  const oldest = now.getTime() - range * DAY_MS

  return rows.filter((row) => {
    if (row.createdAt.getTime() < oldest) return false
    if (filter === "all") return true
    if (filter === "unread") return !row.read
    return row.type === filter
  })
}

/** Why the feed is empty, in the words of whatever it was asked for. */
export function emptyActivityText(
  filter: ActivityFilter,
  range: ActivityRange
) {
  if (filter === "urgent") return "Nothing needs you right now."
  if (filter === "unread") {
    return `Everything from the last ${range} days has been opened.`
  }
  if (filter === "all") return `Nothing happened in the last ${range} days.`
  return `No ${notificationTypeLabels[filter].toLowerCase()} notices in the last ${range} days.`
}
