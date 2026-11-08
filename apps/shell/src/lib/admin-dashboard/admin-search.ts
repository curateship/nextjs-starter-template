import { ANALYTICS_DEFAULT_RANGE, readAnalyticsRange, type AnalyticsRange } from "@/lib/analytics/range"
import { FEEDBACK_TYPES } from "@/lib/feedback/feedback-type"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readDirection, readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"
import type { Role } from "@/lib/role-id"
import { allRoles } from "@/lib/roles"

/**
 * The Admin dashboard's address (Tyler, 8 Nov 2026: one dashboard called
 * Admin in place of the Overview, Users, Plans, Feedback, Announcements and
 * the Analytics screens; `workspace/tasks/features/admin/admin.md`).
 *
 * - `?tab=` picks the middle tab: Overview, Users or Feedback.
 * - `?range=` is the days Overview's cards and every page's figure blocks
 *   count. It is the one key that outlives a tab switch, because the left
 *   page's blocks show on every tab and follow it there too.
 * - Every other key belongs to one tab: Users' and Feedback's list state and
 *   the record open on the right (`?open=`). Picking a tab starts the address
 *   again with that tab alone, so a search on Users never filters Feedback.
 */
export const ADMIN_TABS = ["overview", "users", "feedback"] as const
export type AdminTab = (typeof ADMIN_TABS)[number]

export const ADMIN_TAB_LABELS: Record<AdminTab, string> = {
  overview: "Overview",
  users: "Users",
  feedback: "Feedback",
}

const USER_STATUS_FILTERS = [
  "all",
  "active",
  "unverified",
  "suspended",
  "pending_deletion",
  "locked_out",
] as const
type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number]

const USER_SORT_COLUMNS = ["name", "email", "role", "status", "plan", "created"] as const
export type UserSortColumn = (typeof USER_SORT_COLUMNS)[number]

const FEEDBACK_SORT_COLUMNS = [
  "message",
  "type",
  "status",
  "author",
  "created",
  "comments",
  "votes",
] as const
export type FeedbackSortColumn = (typeof FEEDBACK_SORT_COLUMNS)[number]

const FEEDBACK_TYPE_FILTERS = ["all", ...FEEDBACK_TYPES] as const
type FeedbackTypeFilter = (typeof FEEDBACK_TYPE_FILTERS)[number]

/** Users' keys: the person open on the right, then the list state. */
export type AdminUsersSearch = {
  open?: string
  q?: string
  role?: "all" | Role
  status?: UserStatusFilter
  sort?: UserSortColumn
  direction?: "asc" | "desc"
  page?: number
}

/** Feedback's keys: the thread open on the right, then the list state. */
export type AdminFeedbackSearch = {
  open?: string
  q?: string
  type?: FeedbackTypeFilter
  sort?: FeedbackSortColumn
  direction?: "asc" | "desc"
  page?: number
}

/**
 * Every key the address can hold. Only the open tab's are ever set
 * (`readAdminSearch`); a tab reads its own back with its reader below.
 */
export type AdminSearch = {
  /** Overview when absent. */
  tab?: AdminTab
  /** 30 days when absent. */
  range?: AnalyticsRange
  open?: string
  q?: string
  page?: number
  direction?: "asc" | "desc"
  sort?: UserSortColumn | FeedbackSortColumn
  role?: AdminUsersSearch["role"]
  status?: UserStatusFilter
  type?: FeedbackTypeFilter
}

export function readAdminUsersSearch(search: Record<string, unknown>): AdminUsersSearch {
  return {
    ...readOpenSearch(search),
    q: readSearchText(search.q),
    // Read when the address is, not at import: the list of roles is the app's.
    role: readOneOf(search.role, ["all", ...allRoles().map((role) => role.id)]),
    status: readOneOf(search.status, USER_STATUS_FILTERS),
    sort: readOneOf(search.sort, USER_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

function readAdminFeedbackSearch(search: Record<string, unknown>): AdminFeedbackSearch {
  return {
    ...readOpenSearch(search),
    q: readSearchText(search.q),
    type: readOneOf(search.type, FEEDBACK_TYPE_FILTERS),
    sort: readOneOf(search.sort, FEEDBACK_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

/** Every value is checked before use; a key the open tab does not own is dropped. */
export function readAdminSearch(search: Record<string, unknown>): AdminSearch {
  const tab = readOneOf(search.tab, ADMIN_TABS)
  const range = readAnalyticsRange(search.range)
  if (tab === "users") return { tab, range, ...readAdminUsersSearch(search) }
  if (tab === "feedback") return { tab, range, ...readAdminFeedbackSearch(search) }
  return { tab, range }
}

export function adminTabOf(search: AdminSearch): AdminTab {
  return search.tab ?? "overview"
}

export function adminRangeOf(search: AdminSearch): AnalyticsRange {
  return search.range ?? ANALYTICS_DEFAULT_RANGE
}

/**
 * The address for a tab picked in the header: the tab and the range, nothing
 * else. The tab is always written, Overview too: an address with no tab is a
 * bare one, which sends the dashboard back to the place it last had, so
 * picking Overview would land back on the tab it was picked from.
 */
export function adminTabSearch(tab: AdminTab, range: AnalyticsRange): AdminSearch {
  return {
    tab,
    range: range === ANALYTICS_DEFAULT_RANGE ? undefined : range,
  }
}
