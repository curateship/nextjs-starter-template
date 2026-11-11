import { ANALYTICS_DEFAULT_RANGE, readAnalyticsRange, type AnalyticsRange } from "@/lib/analytics/range"
import { FEEDBACK_TYPES } from "@/lib/feedback/feedback-type"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readDirection, readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"
import { appRoles } from "@/lib/app-options"
import { PAGE_GROUPS, type PageGroup } from "@/lib/pages/page-groups"
import type { Role } from "@/lib/role-id"
import { allRoles } from "@/lib/roles"

/**
 * The Admin dashboard's address (Tyler, 8 Nov 2026: one dashboard called
 * Admin in place of the Overview, Users, Plans, Feedback, Announcements and
 * the Analytics screens; `workspace/tasks/features/admin/admin.md`).
 *
 * - `?tab=` picks the section the middle shows: Overview, Pages, Styling,
 *   Navigations, Users, Feedback, Announcements or Media library (Pages,
 *   Styling and Navigations came in from their own screen and Settings on
 *   9 Nov 2026: "consolidate the pages, navigation and styling into the
 *   admin dashboard") (Announcements moved out of the left
 *   page's ⋮ into a section of its own, Tyler, 9 Nov 2026: "Move the
 *   announcement from the top left settings into its own dashboard"). The left page's Dashboards block picks it (Tyler, 8 Nov
 *   2026: "we're moving the 3 tabs ... to the left side as a block and we
 *   add media library to it too"); the key kept its old name so saved places
 *   and old links still land.
 * - `?range=` is the days Overview's widgets count, and what an app's own
 *   blocks are handed. It is the one key that outlives a section switch,
 *   because the left page's blocks show beside every section.
 * - Every other key belongs to one tab: Users' and Feedback's list state and
 *   the record open on the right (`?open=`). Picking a tab starts the address
 *   again with that tab alone, so a search on Users never filters Feedback.
 */
export const ADMIN_TABS = [
  "overview",
  "pages",
  "styling",
  "navigation",
  "users",
  "feedback",
  "announcements",
  "media",
] as const
export type AdminTab = (typeof ADMIN_TABS)[number]

export const ADMIN_TAB_LABELS: Record<AdminTab, string> = {
  overview: "Overview",
  pages: "Pages",
  styling: "Styling",
  navigation: "Navigations",
  users: "Users",
  feedback: "Feedback",
  announcements: "Announcements",
  media: "Media library",
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

const ANNOUNCEMENT_SORT_COLUMNS = ["title", "level", "starts", "ends"] as const
export type AnnouncementSortColumn = (typeof ANNOUNCEMENT_SORT_COLUMNS)[number]

const ANNOUNCEMENT_STATUS_FILTERS = ["all", "showing", "scheduled", "ended"] as const
type AnnouncementStatusFilter = (typeof ANNOUNCEMENT_STATUS_FILTERS)[number]

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

/** Announcements' keys: the one open on the right, then the list state. */
export type AdminAnnouncementsSearch = {
  open?: string
  q?: string
  /** Showing, Scheduled or Ended; a filter of its own, not Users' `status`. */
  shows?: AnnouncementStatusFilter
  sort?: AnnouncementSortColumn
  direction?: "asc" | "desc"
  page?: number
}

/**
 * Media library's keys: the file open on the right, or the orphan open (an
 * orphan has no record, so it is known by its key), and whose files show.
 * Its search, type, sort and page stay in the library's own state, as they
 * did on its own page.
 */
export type AdminMediaSearch = {
  open?: string
  orphan?: string
  owner?: string
}

/**
 * Pages' keys (Tyler, 9 Nov 2026: "Create a new link called "Pages" under
 * overview"): the page open on the right, known by its address because a page
 * the code declares has no other id, then the list state.
 */
export type AdminPagesSearch = {
  open?: string
  q?: string
  /** Your pages when absent. */
  group?: PageGroup
  /**
   * The page being built, by its address: the builder takes the middle and
   * the right, as an open automation does (Tyler, 9 Nov 2026: "Clicking on
   * editing a page should not forward me to an isolated page editor. Look at
   * how automation does it").
   */
  edit?: string
}

/** Which styling a Styling tab shows: the signed-in app's, or the public site's. */
const STYLING_SIDES = ["platform", "public"] as const
export type StylingSide = (typeof STYLING_SIDES)[number]

/** Styling's keys: the side, then the group open on the right. */
export type AdminStylingSearch = {
  /** Platform when absent. */
  side?: StylingSide
  open?: string
}

/**
 * Which navigation a Navigations tab shows. A role the app declares is
 * `role-` and its id, so it never clashes with the three the shell has.
 */
export type NavigationAudience = "platform" | "members" | "public" | `role-${string}`

export function navigationAudiences(): NavigationAudience[] {
  return ["platform", "members", ...appRoles().map((role) => `role-${role.id}` as const), "public"]
}

/** Navigations' one key: which navigation's editors show. */
export type AdminNavigationSearch = {
  /** Platform when absent. */
  nav?: NavigationAudience
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
  sort?: UserSortColumn | FeedbackSortColumn | AnnouncementSortColumn
  role?: AdminUsersSearch["role"]
  status?: UserStatusFilter
  type?: FeedbackTypeFilter
  shows?: AnnouncementStatusFilter
  orphan?: string
  owner?: string
  group?: PageGroup
  edit?: string
  side?: StylingSide
  nav?: NavigationAudience
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

function readAdminAnnouncementsSearch(search: Record<string, unknown>): AdminAnnouncementsSearch {
  return {
    ...readOpenSearch(search),
    q: readSearchText(search.q),
    shows: readOneOf(search.shows, ANNOUNCEMENT_STATUS_FILTERS),
    sort: readOneOf(search.sort, ANNOUNCEMENT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

/** An owner is an id, at most 36 characters; an orphan's key is a storage path. */
function readText(value: unknown, longest: number) {
  return typeof value === "string" && value.length > 0 && value.length <= longest ? value : undefined
}

export function readAdminMediaSearch(search: Record<string, unknown>): AdminMediaSearch {
  return {
    ...readOpenSearch(search),
    orphan: readText(search.orphan, 512),
    owner: readText(search.owner, 36),
  }
}

function readAdminPagesSearch(search: Record<string, unknown>): AdminPagesSearch {
  return {
    // An address, not an id, so longer than an id's 36 characters.
    open: readText(search.open, 512),
    q: readSearchText(search.q),
    group: readOneOf(search.group, PAGE_GROUPS),
    edit: readPagePath(search.edit),
  }
}

/** A page's address: it starts with "/" and is no longer than one may be. */
function readPagePath(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && value.length <= 512 ? value : undefined
}

function readAdminStylingSearch(search: Record<string, unknown>): AdminStylingSearch {
  return {
    side: readOneOf(search.side, STYLING_SIDES),
    open: readText(search.open, 80),
  }
}

function readAdminNavigationSearch(search: Record<string, unknown>): AdminNavigationSearch {
  return {
    // Read when the address is, not at import: the list of roles is the app's.
    nav: readOneOf(search.nav, navigationAudiences()),
  }
}

/** Every value is checked before use; a key the open tab does not own is dropped. */
export function readAdminSearch(search: Record<string, unknown>): AdminSearch {
  const tab = readOneOf(search.tab, ADMIN_TABS)
  const range = readAnalyticsRange(search.range)
  if (tab === "pages") return { tab, range, ...readAdminPagesSearch(search) }
  if (tab === "styling") return { tab, range, ...readAdminStylingSearch(search) }
  if (tab === "navigation") return { tab, range, ...readAdminNavigationSearch(search) }
  if (tab === "users") return { tab, range, ...readAdminUsersSearch(search) }
  if (tab === "feedback") return { tab, range, ...readAdminFeedbackSearch(search) }
  if (tab === "announcements") return { tab, range, ...readAdminAnnouncementsSearch(search) }
  if (tab === "media") return { tab, range, ...readAdminMediaSearch(search) }
  return { tab, range }
}

export function adminTabOf(search: AdminSearch): AdminTab {
  return search.tab ?? "overview"
}

export function adminRangeOf(search: AdminSearch): AnalyticsRange {
  return search.range ?? ANALYTICS_DEFAULT_RANGE
}

/**
 * The address for a section picked in the Dashboards block: the section and the range, nothing
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
