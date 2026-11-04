import { ARCHIVE_ITEM_KINDS, ARCHIVE_KIND_LABELS, type ArchiveItemKind } from "@/lib/archive/items"

/**
 * What the Archive keeps in its address (`workspace/docs/archive.md`): the
 * project picked on the left, the open item, and the middle panel's tab,
 * search and filters. A pasted link opens the same view.
 */
export type ArchiveSearch = {
  project?: string
  open?: string
  /** The middle panel's tab: every kind, or one of them. */
  kind?: ArchiveItemKind
  q?: string
  /** "no" lists only what was never posted (part 23). */
  posted?: "no"
  /** "views" puts the most watched first (part 24). */
  sort?: "views"
  /** "source" groups items under the Video project they came from (part 25). */
  group?: "source"
  /** "1" shows the project's Bin (part 30). */
  bin?: "1"
}

const ID = /^[A-Za-z0-9-]{1,36}$/

/** The router reads `?bin=1` as the number 1, and a link may say "1". Both count. */
const isOne = (value: unknown) => value === 1 || value === "1"

export function readArchiveSearch(raw: Record<string, unknown>): ArchiveSearch {
  const out: ArchiveSearch = {}
  if (typeof raw.project === "string" && ID.test(raw.project)) out.project = raw.project
  if (typeof raw.open === "string" && ID.test(raw.open)) out.open = raw.open
  if (typeof raw.kind === "string" && (ARCHIVE_ITEM_KINDS as readonly string[]).includes(raw.kind)) out.kind = raw.kind as ArchiveItemKind
  if (typeof raw.q === "string" && raw.q.trim()) out.q = raw.q.slice(0, 120)
  if (raw.posted === "no") out.posted = "no"
  if (raw.sort === "views") out.sort = "views"
  if (raw.group === "source") out.group = "source"
  if (isOne(raw.bin)) out.bin = "1"
  return out
}

/** The saved views' kind: a view belongs to one project's archive. */
export const ARCHIVE_VIEW_KIND = "archive"

/** The filters a saved view keeps: only the ones set. */
export const ARCHIVE_FILTER_KEYS = ["kind", "q", "posted", "sort", "group"] as const

export function keptArchiveFilters(filters: Record<string, unknown>): Record<string, string> {
  const read = readArchiveSearch(filters)
  return Object.fromEntries(ARCHIVE_FILTER_KEYS.flatMap((key) => (read[key] ? [[key, read[key] as string]] : [])))
}

/** How many filters the Filter button counts. The tab and the search have their own controls. */
export function archiveFilterCount(search: ArchiveSearch): number {
  return [search.posted, search.sort, search.group].filter(Boolean).length
}

/** "Videos · Not posted yet · Most viewed": what a view shows. */
export function describeArchiveFilters(filters: Record<string, unknown>): string {
  const read = readArchiveSearch(filters)
  const parts = [
    read.kind ? `${ARCHIVE_KIND_LABELS[read.kind]}s` : "",
    read.q ? `"${read.q}"` : "",
    read.posted ? "Not posted yet" : "",
    read.sort ? "Most viewed" : "",
    read.group ? "By Video project" : "",
  ].filter(Boolean)
  return parts.join(" · ") || "Everything"
}

/** The Archive's keys on a project's own page (part 21): `?archive=1` and the middle panel's tab and filters. */
export function readProjectArchiveSearch(raw: Record<string, unknown>): Omit<ArchiveSearch, "project" | "open"> & { archive?: "1" } {
  if (!isOne(raw.archive)) return {}
  const { project: _project, open: _open, ...rest } = readArchiveSearch(raw)
  return { archive: "1", ...rest }
}
