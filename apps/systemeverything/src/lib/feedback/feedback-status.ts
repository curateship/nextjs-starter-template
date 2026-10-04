/**
 * Where a piece of feedback sits on the roadmap. The one list every screen
 * reads: the member board's badge and filter, the admin table's column, the
 * edit window's dropdown, the server checks, and the migration all mirror it.
 * Adding a status means this file plus a new migration extending the check.
 */

/** The order the statuses are offered and read in — the life of an item. */
export const FEEDBACK_STATUSES = [
  "open",
  "planned",
  "in_progress",
  "done",
] as const

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export const feedbackStatusLabels: Record<FeedbackStatus, string> = {
  open: "Open",
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
}

/**
 * Colours for the statuses that mean something moved. "Open" stays a plain
 * outline badge — it is the resting state of every new item, and painting it
 * would make the whole board shout. The words always carry the meaning; the
 * colour only repeats it.
 */
export const feedbackStatusClassNames: Record<FeedbackStatus, string> = {
  open: "",
  planned:
    "border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/50 dark:text-blue-200",
  in_progress:
    "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-200",
  done: "border-green-200 bg-green-100 text-green-900 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200",
}
