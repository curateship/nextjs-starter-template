import { readDirection, readOneOf, readSearchText } from "@/lib/nav/list-search"
import type { SavedViewValues } from "@/lib/saved-views"
import {
  VIRAL_FIT_CHOICES,
  VIRAL_SORTS,
  VIRAL_SOURCES,
  viralSortLabels,
  viralSourceLabels,
  type ViralFit,
  type ViralSort,
} from "@/lib/video/viral-view"

/**
 * Saved views on a Viral project's middle panel (`viral-project:<id>` in the
 * shell's saved views). A view keeps the same values the address does: the
 * search, where the videos come from, how well they fit, the keyword, and the
 * sort. The defaults (every source, any fit, sorted by score, highest first)
 * stay out, as they do in the address.
 */

export type ViralViewFilters = {
  q?: string
  from?: "search" | "creators"
  fit?: Exclude<ViralFit, 0>
  keyword?: string
  sort?: Exclude<ViralSort, "score">
  direction?: "asc"
}

export const VIRAL_SAVED_VIEW_KIND = "viral-project"

/** The values a view keeps out of the ones given, each checked the way the address checks it. */
export function viralViewFilters(values: SavedViewValues): ViralViewFilters {
  const kept: ViralViewFilters = {}
  const q = readSearchText(values.q)?.trim()
  if (q) kept.q = q
  const from = readOneOf(values.from, VIRAL_SOURCES)
  if (from && from !== "both") kept.from = from
  const fit = Number(values.fit)
  if ((VIRAL_FIT_CHOICES as readonly number[]).includes(fit) && fit > 0) kept.fit = fit as Exclude<ViralFit, 0>
  const keyword = readSearchText(values.keyword)?.trim()
  if (keyword) kept.keyword = keyword
  const sort = readOneOf(values.sort, VIRAL_SORTS)
  if (sort && sort !== "score") kept.sort = sort
  if (readDirection(values.direction) === "asc") kept.direction = "asc"
  return kept
}

/** `"logo" · Followed creators · Fits 70 or more · Keyword: logo design · Sort: Views` */
export function describeViralView(filters: ViralViewFilters) {
  const parts: string[] = []
  if (filters.q) parts.push(`"${filters.q}"`)
  if (filters.from) parts.push(viralSourceLabels[filters.from])
  if (filters.fit) parts.push(`Fits ${filters.fit} or more`)
  if (filters.keyword) parts.push(`Keyword: ${filters.keyword}`)
  if (filters.sort || filters.direction) {
    parts.push(
      `Sort: ${viralSortLabels[filters.sort ?? "score"]}${filters.direction === "asc" ? ", lowest first" : ""}`
    )
  }
  return parts.join(" · ")
}
