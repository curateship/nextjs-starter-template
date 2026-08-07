/**
 * The tabs above the Overview's activity feed, and the rule about what they
 * leave on screen.
 *
 * It sits apart from the feed because it is arithmetic, not drawing: which
 * rows survive a setting is the whole behaviour of the card and it should be
 * possible to check it without rendering anything.
 */

/** The dated ranges plus the unread-only view. */
export type ActivityRange = 7 | 30
export type ActivityView = ActivityRange | "unread"

export const ACTIVITY_VIEWS: { value: ActivityView; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: "unread", label: "Unread" },
]

export const DEFAULT_ACTIVITY_VIEW: ActivityView = 7

const DAY_MS = 24 * 60 * 60 * 1000

/** The least a row must carry for the rules above to judge it. */
export type ActivityRow = {
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
  view: ActivityView,
  now: Date
): Row[] {
  if (view === "unread") return rows.filter((row) => !row.read)

  const oldest = now.getTime() - view * DAY_MS
  return rows.filter((row) => row.createdAt.getTime() >= oldest)
}

/** Why the feed is empty, in the words of the selected tab. */
export function emptyActivityText(view: ActivityView) {
  if (view === "unread") return "All notifications have been read."
  return `Nothing happened in the last ${view} days.`
}
