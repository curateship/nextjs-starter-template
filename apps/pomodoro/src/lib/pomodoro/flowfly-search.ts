import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readDirection, readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"
import { ACHIEVEMENTS } from "@/lib/pomodoro/achievements"
import { readCatalogSearch } from "@/lib/pomodoro/admin-catalog"
import {
  ACHIEVEMENT_SORT_COLUMNS,
  BLOCK_TABS,
  FOLLOW_SORT_COLUMNS,
  GENERATION_KIND_FILTERS,
  GENERATION_SORT_COLUMNS,
  GENERATION_STATUS_FILTERS,
  GROUP_SORT_COLUMNS,
  INVITE_SORT_COLUMNS,
  INVITE_STATUS_FILTERS,
  PROFILE_SORT_COLUMNS,
  PROFILE_VISIBILITY_FILTERS,
  PROJECT_SORT_COLUMNS,
  PROJECT_STATE_FILTERS,
  PROJECT_TARGET_FILTERS,
  PROJECT_VISIBILITY_FILTERS,
  readUserFilter,
  REPORT_SORT_COLUMNS,
  REPORT_STATUS_FILTERS,
  ROOM_PHASE_FILTERS,
  ROOM_REPEAT_SORT_COLUMNS,
  ROOM_REPEAT_STATUS_FILTERS,
  ROOM_SORT_COLUMNS,
  ROOM_VISIBILITY_FILTERS,
  SAFETY_TABS,
  SESSION_MODE_FILTERS,
  SESSION_SORT_COLUMNS,
  SESSION_STATUS_FILTERS,
  SIMULATED_SORT_COLUMNS,
  SIMULATED_TABS,
  TAG_SORT_COLUMNS,
  TASK_REPEAT_SORT_COLUMNS,
  TASK_SORT_COLUMNS,
  TASK_STATUS_FILTERS,
  UPLOAD_PURPOSE_FILTERS,
  UPLOAD_SORT_COLUMNS,
} from "@/lib/pomodoro/admin-lists"
import { UPLOAD_SHARING_FILTERS } from "@/lib/pomodoro/shared-media-reports"

/**
 * The Flowfly admin dashboard's address (Tyler, 13 Nov 2026: "consolidate and
 * combine all of the app's dashboard into one 3 panel dashboard", then "take
 * all seven"). One page at `/admin/flowfly` holds every Pomodoro admin list:
 * seven sections picked on the left, each section's lists as tabs in its one
 * header. `section` and `list` say which list shows; the rest is that list's
 * own search, filters, sort, page and open row, read with the same checks the
 * list's own page used, so a pasted link opens the same view.
 *
 * Tyler cut the 25 sections to seven himself, which overrides the Admin 3
 * panel skill's rule that sections never show as tabs in the middle.
 */

export const FLOWFLY_SECTIONS = ["overview", "rooms", "members", "safety", "social", "tasks", "library"] as const
export type FlowflySection = (typeof FLOWFLY_SECTIONS)[number]

/** Every section but Overview, which the Dashboards block can hide and move. */
export type FlowflyListSection = Exclude<FlowflySection, "overview">
export const FLOWFLY_LIST_SECTIONS: readonly FlowflyListSection[] = ["rooms", "members", "safety", "social", "tasks", "library"]

export const FLOWFLY_SECTION_LABELS: Record<FlowflySection, string> = {
  overview: "Overview",
  rooms: "Rooms",
  members: "Members",
  safety: "Safety",
  social: "Social",
  tasks: "Tasks",
  library: "Library",
}

/**
 * Each section's tabs, in Tyler's order. No Chat tab under Rooms (Tyler,
 * 13 Nov 2026: "we dont need this tab"): a room's chat is a card in its
 * right panel.
 */
export const FLOWFLY_TABS = {
  rooms: ["rooms", "weekly", "invites", "presets"],
  // No Focus or Leaderboard (Tyler, 13 Nov 2026: "we dont need the focus and
  // leaderboard tab"); Profiles carries each person's focus time instead.
  members: ["profiles", "badges", "madeup"],
  safety: ["reports", "bans", "blocks"],
  social: ["groups", "follows", "cheers"],
  tasks: ["tasks", "sessions", "repeats", "projects", "tags"],
  library: ["backgrounds", "sounds", "uploads", "generations"],
} as const satisfies Record<FlowflyListSection, readonly string[]>

export type FlowflyTab = (typeof FLOWFLY_TABS)[FlowflyListSection][number]

export const FLOWFLY_TAB_LABELS: Record<FlowflyTab, string> = {
  rooms: "Rooms",
  weekly: "Weekly rooms",
  invites: "Invites",
  presets: "Presets",
  profiles: "Profiles",
  badges: "Badges",
  madeup: "Made-up",
  reports: "Reports",
  bans: "Bans",
  blocks: "Blocks",
  groups: "Groups",
  follows: "Follows",
  cheers: "Cheers",
  tasks: "Tasks",
  sessions: "Sessions",
  repeats: "Repeating",
  projects: "Projects",
  tags: "Tags",
  backgrounds: "Backgrounds",
  sounds: "Sounds",
  uploads: "Member uploads",
  generations: "AI generations",
}

const ALL_TABS = Object.values(FLOWFLY_TABS).flat() as FlowflyTab[]

/** The section a tab sits in. */
export function sectionOfTab(tab: FlowflyTab): FlowflyListSection {
  return (Object.keys(FLOWFLY_TABS) as FlowflyListSection[]).find((section) =>
    (FLOWFLY_TABS[section] as readonly string[]).includes(tab)
  ) as FlowflyListSection
}

/** The Made-up tab's three lists, its view dropdown. */
export const MADEUP_PARTS = ["members", "schedule", "lines"] as const
export type MadeupPart = (typeof MADEUP_PARTS)[number]

const BADGE_IDS = ACHIEVEMENTS.map((badge) => badge.id)

type Reader = (value: unknown) => unknown
const text: Reader = readSearchText
const oneOf =
  <const T extends string>(values: readonly T[]): Reader =>
  (value) =>
    readOneOf(value, values)

/** What each list may hold in the address, with the check its own page made. */
const TAB_KEYS: Record<FlowflyTab, Record<string, Reader>> = {
  rooms: { phase: oneOf(ROOM_PHASE_FILTERS), visibility: oneOf(ROOM_VISIBILITY_FILTERS), sort: oneOf(ROOM_SORT_COLUMNS) },
  weekly: { status: oneOf(ROOM_REPEAT_STATUS_FILTERS), sort: oneOf(ROOM_REPEAT_SORT_COLUMNS) },
  invites: { status: oneOf(INVITE_STATUS_FILTERS), sort: oneOf(INVITE_SORT_COLUMNS) },
  presets: {},
  profiles: { visibility: oneOf(PROFILE_VISIBILITY_FILTERS), sort: oneOf(PROFILE_SORT_COLUMNS) },
  badges: { user: readUserFilter, badge: oneOf(BADGE_IDS), sort: oneOf(ACHIEVEMENT_SORT_COLUMNS) },
  madeup: { part: oneOf(MADEUP_PARTS), tab: oneOf(SIMULATED_TABS), sort: oneOf(SIMULATED_SORT_COLUMNS), lines: readPage },
  reports: { status: oneOf(REPORT_STATUS_FILTERS), sort: oneOf(REPORT_SORT_COLUMNS), person: text },
  bans: { tab: oneOf(SAFETY_TABS) },
  blocks: { tab: oneOf(BLOCK_TABS), user: readUserFilter },
  groups: { user: readUserFilter, sort: oneOf(GROUP_SORT_COLUMNS) },
  follows: { user: readUserFilter, sort: oneOf(FOLLOW_SORT_COLUMNS) },
  cheers: { user: readUserFilter, sort: oneOf(FOLLOW_SORT_COLUMNS) },
  tasks: { status: oneOf(TASK_STATUS_FILTERS), user: readUserFilter, sort: oneOf(TASK_SORT_COLUMNS) },
  sessions: {
    mode: oneOf(SESSION_MODE_FILTERS),
    status: oneOf(SESSION_STATUS_FILTERS),
    user: readUserFilter,
    sort: oneOf(SESSION_SORT_COLUMNS),
  },
  repeats: { user: readUserFilter, sort: oneOf(TASK_REPEAT_SORT_COLUMNS) },
  projects: {
    user: readUserFilter,
    state: oneOf(PROJECT_STATE_FILTERS),
    visibility: oneOf(PROJECT_VISIBILITY_FILTERS),
    target: oneOf(PROJECT_TARGET_FILTERS),
    sort: oneOf(PROJECT_SORT_COLUMNS),
  },
  tags: { user: readUserFilter, sort: oneOf(TAG_SORT_COLUMNS) },
  // Backgrounds and Sounds are read with the catalogue's own reader below.
  backgrounds: {},
  sounds: {},
  uploads: {
    purpose: oneOf(UPLOAD_PURPOSE_FILTERS),
    user: readUserFilter,
    sharing: oneOf(UPLOAD_SHARING_FILTERS),
    sort: oneOf(UPLOAD_SORT_COLUMNS),
  },
  generations: {
    kind: oneOf(GENERATION_KIND_FILTERS),
    status: oneOf(GENERATION_STATUS_FILTERS),
    user: readUserFilter,
    sort: oneOf(GENERATION_SORT_COLUMNS),
  },
}

/** Lists with no search box of their own. */
const NO_SEARCH: ReadonlySet<FlowflyTab> = new Set(["presets"])
/** Lists with no paging. */
const NO_PAGES: ReadonlySet<FlowflyTab> = new Set(["presets"])

/**
 * The address. Every value is optional; a list reads the ones it knows and
 * falls back to its own defaults for the rest.
 */
export type FlowflySearch = {
  /** Absent only on the bare address, which goes back to the last place. */
  section?: FlowflySection
  /** The tab showing in the section; absent means the section's first. */
  list?: FlowflyTab
  /** The row open on the right. */
  open?: string
  /** A member open on the right in place of the row (Tyler's pick "Member on the right"). */
  member?: string
  q?: string
  sort?: string
  direction?: "asc" | "desc"
  page?: number
} & Record<string, unknown>

export function readFlowflySearch(raw: Record<string, unknown>): FlowflySearch {
  const out: FlowflySearch = {}
  const section = readOneOf(raw.section, FLOWFLY_SECTIONS)
  if (section) out.section = section
  const listed = readOneOf(raw.list, ALL_TABS)
  // A tab from another section is not this section's: the section's first shows.
  if (listed && section && section !== "overview" && sectionOfTab(listed) === section) out.list = listed
  const member = readUserFilter(raw.member)
  if (member) out.member = member
  if (!section || section === "overview") return out
  const tab = out.list ?? FLOWFLY_TABS[section][0]
  const { open } = readOpenSearch(raw)
  if (open) out.open = open
  if (tab === "backgrounds" || tab === "sounds") {
    for (const [key, value] of Object.entries(readCatalogSearch(raw))) if (value !== undefined && key !== "open") out[key] = value
    return out
  }
  if (!NO_SEARCH.has(tab)) {
    const q = readSearchText(raw.q)
    if (q) out.q = q
  }
  const direction = readDirection(raw.direction)
  if (direction) out.direction = direction
  if (!NO_PAGES.has(tab)) {
    const page = readPage(raw.page)
    if (page) out.page = page
  }
  for (const [key, read] of Object.entries(TAB_KEYS[tab])) {
    const value = read(raw[key])
    if (value !== undefined && value !== "") out[key] = value
  }
  return out
}

/** The section showing; a bare address has already been sent back to the last place. */
export function flowflySectionOf(search: FlowflySearch): FlowflySection {
  return search.section ?? "rooms"
}

/** The tab showing in a section with lists. */
export function flowflyTabOf(search: FlowflySearch): FlowflyTab | null {
  const section = flowflySectionOf(search)
  if (section === "overview") return null
  return search.list ?? FLOWFLY_TABS[section][0]
}

/**
 * The address for a section or tab picked: a fresh start there. The tab is
 * named only when it is not the section's first, so a section's own link
 * reads short.
 */
export function flowflySearchFor(
  section: FlowflySection,
  tab?: FlowflyTab,
  keep: Partial<FlowflySearch> = {}
): FlowflySearch {
  const out: FlowflySearch = { section }
  if (tab && section !== "overview" && tab !== FLOWFLY_TABS[section][0]) out.list = tab
  return { ...out, ...keep }
}

/**
 * Where each old `/admin/pomodoro-*` page lives now. Its route forwards there
 * keeping the rest of its address, and migration 0183 points saved bell
 * notices the same way. Chat has no tab (Tyler: "we dont need this tab"), so
 * it goes to Rooms; Focus and Leaderboard went the same way and go to
 * Profiles; Follows' old Cheers tab goes to Cheers.
 */
export const OLD_ADMIN_PAGES = {
  "pomodoro-rooms": "rooms",
  "pomodoro-room-repeats": "weekly",
  "pomodoro-invites": "invites",
  "pomodoro-room-presets": "presets",
  "pomodoro-chat": "rooms",
  "pomodoro-focus": "profiles",
  "pomodoro-profiles": "profiles",
  "pomodoro-leaderboard": "profiles",
  "pomodoro-achievements": "badges",
  "pomodoro-simulated": "madeup",
  "pomodoro-reports": "reports",
  "pomodoro-bans": "bans",
  "pomodoro-blocks": "blocks",
  "pomodoro-groups": "groups",
  "pomodoro-follows": "follows",
  "pomodoro-tasks": "tasks",
  "pomodoro-sessions": "sessions",
  "pomodoro-task-repeats": "repeats",
  "pomodoro-projects": "projects",
  "pomodoro-tags": "tags",
  "pomodoro-themes": "backgrounds",
  "pomodoro-media": "backgrounds",
  "pomodoro-sounds": "sounds",
  "pomodoro-uploads": "uploads",
  "pomodoro-generations": "generations",
} as const satisfies Record<string, FlowflyTab>

export type OldAdminPage = keyof typeof OLD_ADMIN_PAGES

/**
 * The Flowfly address an old page's address forwards to: its tab, then the
 * old address's own values, which the tab reads with its usual checks. Chat's
 * old values mean nothing to Rooms and are dropped; a Follows link on its
 * Cheers tab opens Cheers.
 */
export function oldPageSearch(page: OldAdminPage, old: Record<string, unknown>): FlowflySearch {
  let tab: FlowflyTab = OLD_ADMIN_PAGES[page]
  // Chat's, Focus's and Leaderboard's values mean nothing to their new tab.
  const kept: Record<string, unknown> =
    page === "pomodoro-chat" || page === "pomodoro-focus" || page === "pomodoro-leaderboard" ? {} : { ...old }
  if (page === "pomodoro-follows" && old.tab === "cheers") tab = "cheers"
  if (page === "pomodoro-follows") delete kept.tab
  // The simulated page's three tables were one page; its `tab` is the members table's filter.
  return readFlowflySearch({ ...kept, section: sectionOfTab(tab), list: tab })
}

/** The address of one list, for a link from anywhere: `flowflyLink("tasks", { user })`. */
export function flowflyLink(tab: FlowflyTab, keep: Partial<FlowflySearch> = {}): FlowflySearch {
  return flowflySearchFor(sectionOfTab(tab), tab, keep)
}
