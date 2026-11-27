import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readOneOf, readSearchText } from "@/lib/nav/list-search"
import { ACCOUNT_STATUSES, type AccountStatus } from "@/lib/social/account-status"
import { NETWORKS, type Network } from "@/lib/social/networks"
import { RETIRED_REASONS } from "@/lib/bans/options"
import { readViralDashboardSearch, VIRAL_SECTIONS } from "@/lib/viral/dashboard-search"
import type { VaultStatus } from "@/lib/viral/vault"

/**
 * What the Projects dashboard's address holds (Tyler, 12 Nov 2026: "We need
 * to consolidate projects, voices, accounts, archive and messages into one
 * cohesive 3 panel design"), so a reload, Back or a pasted link opens the
 * same section, project, filters and open row. Projects is the section with
 * no `section`, so `/admin/projects` alone still lands on it.
 */

/**
 * Content's sections (`workspace/docs/content-app.md`, "The Projects
 * dashboard"): Overview, Projects, Accounts and Messages in the Dashboards
 * block, and Research's three lists that belong to no one project, every
 * project's Vault, Hooks and Formats, in the Viral block. Research itself
 * lives inside each project. Voices and the Archive are each project's: a
 * network's Voices tab and the project's Content tab (Tyler, 27 Nov 2026:
 * "The voice should not be its own sidebar link", "Archive should also not
 * have its own link either").
 */
export const PROJECTS_SECTIONS = ["overview", "projects", "accounts", "messages", "vault", "hooks", "formats"] as const
export type ProjectsSection = (typeof PROJECTS_SECTIONS)[number]

/** A section the Dashboards block can hide or move: every one but Overview. */
export type ProjectsListSection = Exclude<ProjectsSection, "overview">
export const PROJECTS_LIST_SECTIONS: readonly ProjectsListSection[] = ["projects", "accounts", "messages", "vault", "hooks", "formats"]

/** The Dashboards block's rows; Research's are the Viral block's. */
export const DASHBOARDS_SECTIONS = ["overview", "projects", "accounts", "messages"] as const satisfies readonly ProjectsSection[]

/** The sections that are Research's, drawn by its own section screens. */
export const RESEARCH_SECTIONS = VIRAL_SECTIONS
export type ResearchSection = (typeof RESEARCH_SECTIONS)[number]

export function isResearchSection(section: ProjectsSection): section is ResearchSection {
  return (RESEARCH_SECTIONS as readonly string[]).includes(section)
}

export const PROJECTS_SECTION_LABELS: Record<ProjectsSection, string> = {
  overview: "Overview",
  projects: "Projects",
  accounts: "Accounts",
  messages: "Messages",
  vault: "Vault",
  hooks: "Hooks",
  formats: "Formats",
}

/** An account's importance, as Accounts' Filter names it. */
const IMPORTANCE = ["important", "throwaway"] as const

/** Accounts' Filter value for an account retired before reasons were kept. */
export const REASON_NOT_RECORDED = "not_recorded"
const REASONS = [...RETIRED_REASONS, REASON_NOT_RECORDED] as const

export type ProjectsSearch = {
  section?: Exclude<ProjectsSection, "projects">
  /**
   * Vault, Hooks and Formats: one project, from a saved view that holds one. The other sections show every project's rows: the Projects block
   * that narrowed them is gone (Tyler, 27 Nov 2026: "Remove projects block.
   * List row only").
   */
  project?: string
  /** The row open on the right. */
  open?: string
  /** Words to find, in the section showing. */
  q?: string
  /** Accounts and Messages: one network. */
  platform?: Network
  /** Accounts: the Retired tab; In use when absent. Vault: "board" in place of the list. */
  show?: "retired" | "board"
  /** Accounts: one status. Vault: one idea status. */
  status?: AccountStatus | VaultStatus
  /** Hooks: one hook type. */
  type?: string
  /** Accounts: important or throwaway. */
  importance?: (typeof IMPORTANCE)[number]
  /** Accounts: one tag of its profile or phone. */
  tag?: string
  /** Accounts' Retired tab: why it was retired. */
  reason?: (typeof REASONS)[number]
}

const ID = /^[A-Za-z0-9-]{1,36}$/

/** Accounts' Filter and its Retired tab, on the Projects dashboard and on a network's Accounts tab. */
export type AccountsFilter = Pick<ProjectsSearch, "importance" | "tag" | "reason" | "status"> & { show?: "retired" }

/** Accounts' Filter read safely from an address. Status here is an account's status. */
export function readAccountsFilter(search: Record<string, unknown>): AccountsFilter {
  const out: AccountsFilter = {}
  if (search.show === "retired") out.show = "retired"
  const status = readOneOf(search.status, ACCOUNT_STATUSES)
  if (status) out.status = status
  const importance = readOneOf(search.importance, IMPORTANCE)
  if (importance) out.importance = importance
  const tag = readSearchText(search.tag)
  if (tag) out.tag = tag
  const reason = readOneOf(search.reason, REASONS)
  if (reason) out.reason = reason
  return out
}


/** The address read safely: anything unknown falls back to the default. */
export function readProjectsSearch(search: Record<string, unknown>): ProjectsSearch {
  const out: ProjectsSearch = {}
  // Voices and Archive, sections before 27 Nov 2026, land on Projects as anything unknown does.
  const section = readOneOf(search.section, ["overview", "accounts", "messages", "vault", "hooks", "formats"] as const)
  if (section) out.section = section
  // Research's sections read their own keys, as its dashboard did (`dashboard-search.ts`).
  if (section && isResearchSection(section)) {
    const research = readViralDashboardSearch(search)
    if (research.project) out.project = research.project
    if (research.open) out.open = research.open
    if (research.q) out.q = research.q
    if (research.status) out.status = research.status
    if (research.tag) out.tag = research.tag
    if (research.type) out.type = research.type
    if (research.show) out.show = research.show
    return out
  }
  const { open } = readOpenSearch(search)
  if (open && ID.test(open)) out.open = open
  const q = readSearchText(search.q)
  if (q) out.q = q
  const platform = readOneOf(search.platform, NETWORKS)
  if (platform) out.platform = platform
  Object.assign(out, readAccountsFilter(search))
  return out
}

export function sectionOf(search: ProjectsSearch): ProjectsSection {
  return search.section ?? "projects"
}

/** The address for a section picked in the Dashboards or Viral block: a fresh start in that section. */
export function sectionSearch(section: ProjectsSection): ProjectsSearch {
  return section === "projects" ? {} : { section }
}
