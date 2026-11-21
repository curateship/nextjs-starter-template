import { readDirection, readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"
import { cleanTag, VAULT_STATUSES, type VaultStatus } from "@/lib/viral/vault"

/**
 * What the Viral dashboard's address holds (task features/03), so a reload,
 * Back or a pasted link opens the same row, the same filters and the same
 * open record. Projects is the row with no `section`, so `/admin/viral`
 * alone lands on the first list, as the shell's dashboards do.
 *
 * The rows (Tyler, 19 Nov 2026): Overview plus four lists, Projects, Vault,
 * Hooks and Formats, which were Today, Projects, Vault and Library.
 */

export const VIRAL_SECTIONS = ["overview", "projects", "vault", "hooks", "formats"] as const
export type ViralSection = (typeof VIRAL_SECTIONS)[number]

/** A row the Dashboards block can hide or move: every one but Overview. */
export type ViralListSection = Exclude<ViralSection, "overview">
export const VIRAL_LIST_SECTIONS: readonly ViralListSection[] = ["projects", "vault", "hooks", "formats"]

export const VIRAL_SECTION_LABELS: Record<ViralSection, string> = {
  overview: "Overview",
  projects: "Projects",
  vault: "Vault",
  hooks: "Hooks",
  formats: "Formats",
}

export const VIRAL_PROJECT_SORT_COLUMNS = ["name", "videos", "units", "updated"] as const
export type ViralProjectSort = (typeof VIRAL_PROJECT_SORT_COLUMNS)[number]

export type ViralDashboardSearch = {
  section?: Exclude<ViralSection, "projects">
  /** The record open on the right: a project's preview, an idea, a hook or a format. */
  open?: string
  q?: string
  /** Projects: the column sorted on and which way. */
  sort?: ViralProjectSort
  direction?: "asc" | "desc"
  page?: number
  /** Projects: a folder's id, `none` for projects in no folder, or `archived`. */
  folder?: string
  /** Vault, Hooks and Formats: the project picked in the Projects block. */
  project?: string
  /** Vault: one status. */
  status?: VaultStatus
  /** Vault and Hooks: one tag. */
  tag?: string
  /** Hooks: one hook type. */
  type?: string
  /** Vault: Board in place of the list. */
  show?: "board"
}

const ID = /^[\w-]{1,36}$/

function readId(value: unknown) {
  return typeof value === "string" && ID.test(value) ? value : undefined
}

/** The address read safely: anything unknown falls back to the default. */
export function readViralDashboardSearch(search: Record<string, unknown>): ViralDashboardSearch {
  const out: ViralDashboardSearch = {}
  const section = readOneOf(search.section, VIRAL_SECTIONS)
  if (section && section !== "projects") out.section = section
  const open = readId(search.open)
  if (open) out.open = open
  const q = readSearchText(search.q)
  if (q) out.q = q
  const sort = readOneOf(search.sort, VIRAL_PROJECT_SORT_COLUMNS)
  if (sort) out.sort = sort
  const direction = readDirection(search.direction)
  if (direction) out.direction = direction
  const page = readPage(search.page)
  if (page) out.page = page
  const folder = readId(search.folder)
  if (folder) out.folder = folder
  const project = readId(search.project)
  if (project) out.project = project
  const status = readOneOf(search.status, VAULT_STATUSES)
  if (status) out.status = status
  const tag = typeof search.tag === "string" ? cleanTag(search.tag) : ""
  if (tag) out.tag = tag
  const type = readId(search.type)
  if (type) out.type = type
  if (search.show === "board") out.show = "board"
  return out
}

export function viralSectionOf(search: ViralDashboardSearch): ViralSection {
  return search.section ?? "projects"
}

/** The address for a row picked in the Dashboards block: a fresh start in that row, keeping the picked project. */
export function viralSectionSearch(section: ViralSection, keep: Partial<ViralDashboardSearch> = {}): ViralDashboardSearch {
  return { ...(section === "projects" ? {} : { section }), ...keep }
}
