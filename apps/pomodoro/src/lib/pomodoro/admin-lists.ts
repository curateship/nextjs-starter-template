/**
 * What the operator lists under /admin can be asked for: every sort column,
 * every filter, and the reader for the one filter that is not a fixed list.
 *
 * One file, because three places need the same answer and they must not
 * disagree. The route checks the address against these, the server function
 * validates against these, and the table draws its headings from these. Held
 * apart from `@/server/pomodoro/admin` so a route can import a list without
 * dragging the database driver into the browser bundle.
 */

/** The largest page any operator list will hand back. */
export const ADMIN_PAGE_SIZE_MAX = 100

export const FOCUS_SORT_COLUMNS = [
  "name",
  "sessions",
  "focus",
  "tasks",
  "last",
] as const
export type FocusSortColumn = (typeof FOCUS_SORT_COLUMNS)[number]

export const TASK_STATUS_FILTERS = [
  "all",
  "active",
  "completed",
  "carried",
  "abandoned",
] as const
export const TASK_SORT_COLUMNS = [
  "title",
  "person",
  "date",
  "status",
  "pomodoros",
  "created",
] as const
export type TaskSortColumn = (typeof TASK_SORT_COLUMNS)[number]

export const SESSION_MODE_FILTERS = ["all", "focus", "short", "long"] as const
export const SESSION_STATUS_FILTERS = [
  "all",
  "running",
  "paused",
  "completed",
  "cancelled",
] as const
export const SESSION_SORT_COLUMNS = [
  "person",
  "mode",
  "status",
  "length",
  "started",
] as const
export type SessionSortColumn = (typeof SESSION_SORT_COLUMNS)[number]

export const ROOM_PHASE_FILTERS = [
  "all",
  "waiting",
  "focus",
  "short",
  "long",
  "closed",
] as const
export const ROOM_VISIBILITY_FILTERS = ["all", "public", "unlisted"] as const
export const ROOM_SORT_COLUMNS = [
  "name",
  "host",
  "phase",
  "members",
  "created",
] as const
export type RoomSortColumn = (typeof ROOM_SORT_COLUMNS)[number]

export const REPORT_STATUSES = ["pending", "resolved", "dismissed"] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]
export const REPORT_STATUS_FILTERS = ["all", ...REPORT_STATUSES] as const
export const REPORT_SORT_COLUMNS = [
  "room",
  "reporter",
  "status",
  "created",
] as const
export type ReportSortColumn = (typeof REPORT_SORT_COLUMNS)[number]

/**
 * `?user=<account id>` is how the Focus data page hands a person to the Tasks
 * and Sessions pages. Only the shape is checked here; whether that account
 * exists is the list's own answer, and an empty table is the honest one for an
 * id that does not.
 */
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,36}$/

export function readUserFilter(value: unknown) {
  return typeof value === "string" && USER_ID_PATTERN.test(value)
    ? value
    : undefined
}
