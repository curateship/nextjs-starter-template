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

/** Weekly rooms: still booking, or stopped by the host's Cancel the series. */
export const ROOM_REPEAT_STATUS_FILTERS = ["all", "active", "cancelled"] as const
export const ROOM_REPEAT_SORT_COLUMNS = [
  "name",
  "host",
  "next",
  "created",
] as const
export type RoomRepeatSortColumn = (typeof ROOM_REPEAT_SORT_COLUMNS)[number]

export const INVITE_STATUS_FILTERS = [
  "all",
  "queued",
  "sent",
  "failed",
  "cancelled",
] as const
export const INVITE_SORT_COLUMNS = ["room", "email", "status", "created"] as const
export type InviteSortColumn = (typeof INVITE_SORT_COLUMNS)[number]

export const TASK_REPEAT_SORT_COLUMNS = ["title", "person", "created"] as const
export type TaskRepeatSortColumn = (typeof TASK_REPEAT_SORT_COLUMNS)[number]

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

/** The Chat dashboard (admin task 05): its tabs, and the rooms tab's filters. */
export const CHAT_TABS = ["rooms", "messages", "held"] as const
export type ChatTab = (typeof CHAT_TABS)[number]
export const CHAT_STATUS_FILTERS = ["all", "open", "closed"] as const
export const CHAT_ROOM_SORT_COLUMNS = ["last", "messages", "name"] as const
export type ChatRoomSortColumn = (typeof CHAT_ROOM_SORT_COLUMNS)[number]

/** Bans and hidden profiles (admin task 05): one page, three tabs. */
export const SAFETY_TABS = ["bans", "hidden", "suspensions"] as const
export type SafetyTab = (typeof SAFETY_TABS)[number]

// ---------------------------------------------------------------------------
// Members in the admin (admin task 06)
// ---------------------------------------------------------------------------

/**
 * `?member=<account id>` opens the member window over any Pomoder admin page.
 * Every Pomoder admin route spreads this into its own `validateSearch`, so the
 * window survives the page's own checks and Back closes it.
 */
export function readMemberSearch(search: Record<string, unknown>) {
  return { member: readUserFilter(search.member) }
}

/** Public profiles: every profile with a handle. */
export const PROFILE_VISIBILITY_FILTERS = ["all", "public", "private", "hidden"] as const
export const PROFILE_SORT_COLUMNS = ["name", "handle", "followers", "updated"] as const
export type ProfileSortColumn = (typeof PROFILE_SORT_COLUMNS)[number]

/** Member uploads: every background and sound a member uploaded or generated. */
export const UPLOAD_PURPOSE_FILTERS = ["all", "background", "sound"] as const
export const UPLOAD_SORT_COLUMNS = ["owner", "size", "created"] as const
export type UploadSortColumn = (typeof UPLOAD_SORT_COLUMNS)[number]

/** Member task tags. */
export const TAG_SORT_COLUMNS = ["name", "owner", "tasks", "created"] as const
export type TagSortColumn = (typeof TAG_SORT_COLUMNS)[number]

/** The leaderboard as members see it, plus who an admin took off it. */
export const LEADERBOARD_TABS = ["board", "hidden"] as const
export type LeaderboardTab = (typeof LEADERBOARD_TABS)[number]

/** Follows and cheers: one page, two tabs. */
export const FOLLOW_TABS = ["follows", "cheers"] as const
export type FollowTab = (typeof FOLLOW_TABS)[number]
/** "most" orders follows by how many the follower has, biggest first. */
export const FOLLOW_SORT_COLUMNS = ["created", "most"] as const
export type FollowSortColumn = (typeof FOLLOW_SORT_COLUMNS)[number]

/** Blocks: every block, or the most blocked accounts with their count. */
export const BLOCK_TABS = ["blocks", "most"] as const
export type BlockTab = (typeof BLOCK_TABS)[number]

/** Achievements: who earned which badge. The badge filter is checked by id. */
export const ACHIEVEMENT_SORT_COLUMNS = ["person", "badge", "earned"] as const
export type AchievementSortColumn = (typeof ACHIEVEMENT_SORT_COLUMNS)[number]

/** Focus groups. */
export const GROUP_SORT_COLUMNS = ["name", "owner", "members", "created"] as const
export type GroupSortColumn = (typeof GROUP_SORT_COLUMNS)[number]

/** AI generations. */
export const GENERATION_KIND_FILTERS = ["all", "background", "soundscape"] as const
export const GENERATION_STATUS_FILTERS = ["all", "queued", "running", "ready", "failed"] as const
export const GENERATION_SORT_COLUMNS = ["person", "status", "created"] as const
export type GenerationSortColumn = (typeof GENERATION_SORT_COLUMNS)[number]
