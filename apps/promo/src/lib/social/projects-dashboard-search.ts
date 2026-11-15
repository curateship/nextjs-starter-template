import { ARCHIVE_ITEM_KINDS, type ArchiveItemKind } from "@/lib/archive/items"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readOneOf, readSearchText } from "@/lib/nav/list-search"
import { ACCOUNT_STATUSES, type AccountStatus } from "@/lib/social/account-status"
import { NETWORKS, type Network } from "@/lib/social/networks"
import { RETIRED_REASONS } from "@/lib/bans/options"

/**
 * What the Projects dashboard's address holds (Tyler, 12 Nov 2026: "We need
 * to consolidate projects, voices, accounts, archive and messages into one
 * cohesive 3 panel design"), so a reload, Back or a pasted link opens the
 * same section, project, filters and open row. Projects is the section with
 * no `section`, so `/admin/projects` alone still lands on it.
 */

export const PROJECTS_SECTIONS = ["overview", "projects", "voices", "accounts", "archive", "messages"] as const
export type ProjectsSection = (typeof PROJECTS_SECTIONS)[number]

/** A section the Dashboards block can hide or move: every one but Overview. */
export type ProjectsListSection = Exclude<ProjectsSection, "overview">
export const PROJECTS_LIST_SECTIONS: readonly ProjectsListSection[] = ["projects", "voices", "accounts", "archive", "messages"]

export const PROJECTS_SECTION_LABELS: Record<ProjectsSection, string> = {
  overview: "Overview",
  projects: "Projects",
  voices: "Voices",
  accounts: "Accounts",
  archive: "Archive",
  messages: "Messages",
}

/** An account's importance, as Accounts' Filter names it. */
const IMPORTANCE = ["important", "throwaway"] as const

/** Accounts' Filter value for an account retired before reasons were kept. */
export const REASON_NOT_RECORDED = "not_recorded"
const REASONS = [...RETIRED_REASONS, REASON_NOT_RECORDED] as const

export type ProjectsSearch = {
  section?: Exclude<ProjectsSection, "projects">
  /** One project, picked in the Projects block: Overview, Accounts, Archive and Messages show only its rows. */
  project?: string
  /** The row open on the right. */
  open?: string
  /** Words to find, in the section showing. */
  q?: string
  /** Accounts and Messages: one network. */
  platform?: Network
  /** Accounts: the Retired tab; In use when absent. */
  show?: "retired"
  /** Accounts: one status. */
  status?: AccountStatus
  /** Accounts: important or throwaway. */
  importance?: (typeof IMPORTANCE)[number]
  /** Accounts: one tag of its profile or phone. */
  tag?: string
  /** Accounts' Retired tab: why it was retired. */
  reason?: (typeof REASONS)[number]
  /** Archive: one kind. */
  kind?: ArchiveItemKind
  /** Archive: "no" lists only what was never posted. */
  posted?: "no"
  /** Archive: "views" puts the most watched first. */
  sort?: "views"
  /** Archive: "source" groups items under the Video project they came from. */
  group?: "source"
  /** Archive: "1" shows the Bin. */
  bin?: "1"
}

const ID = /^[A-Za-z0-9-]{1,36}$/

const isOne = (value: unknown) => value === 1 || value === "1"

/** The address read safely: anything unknown falls back to the default. */
export function readProjectsSearch(search: Record<string, unknown>): ProjectsSearch {
  const out: ProjectsSearch = {}
  const section = readOneOf(search.section, ["overview", "voices", "accounts", "archive", "messages"] as const)
  if (section) out.section = section
  if (typeof search.project === "string" && ID.test(search.project)) out.project = search.project
  const { open } = readOpenSearch(search)
  if (open && ID.test(open)) out.open = open
  const q = readSearchText(search.q)
  if (q) out.q = q
  const platform = readOneOf(search.platform, NETWORKS)
  if (platform) out.platform = platform
  if (search.show === "retired") out.show = "retired"
  const status = readOneOf(search.status, ACCOUNT_STATUSES)
  if (status) out.status = status
  const importance = readOneOf(search.importance, IMPORTANCE)
  if (importance) out.importance = importance
  const tag = readSearchText(search.tag)
  if (tag) out.tag = tag
  const reason = readOneOf(search.reason, REASONS)
  if (reason) out.reason = reason
  const kind = readOneOf(search.kind, ARCHIVE_ITEM_KINDS)
  if (kind) out.kind = kind
  if (search.posted === "no") out.posted = "no"
  if (search.sort === "views") out.sort = "views"
  if (search.group === "source") out.group = "source"
  if (isOne(search.bin)) out.bin = "1"
  return out
}

export function sectionOf(search: ProjectsSearch): ProjectsSection {
  return search.section ?? "projects"
}

/**
 * The address for a section picked in the Dashboards block: a fresh start in
 * that section, keeping only the project picked in the Projects block.
 */
export function sectionSearch(section: ProjectsSection, keep: Partial<ProjectsSearch> = {}): ProjectsSearch {
  return { ...(section === "projects" ? {} : { section }), ...keep }
}
