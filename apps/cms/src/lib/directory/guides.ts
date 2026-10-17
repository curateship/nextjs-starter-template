/**
 * What a guide is allowed to hold, and the address of its drawn share card.
 * Browser-safe, so the guide window and the server read the same limits.
 */

export const MAX_GUIDE_TITLE = 200
export const MAX_GUIDE_INTRO = 1000
/** More than any guide anybody passes around, and a stop on a runaway list. */
export const MAX_GUIDE_LISTINGS = 100

export type GuideStatus = "draft" | "published"

/** The Guides screen's sortable columns, in the order the table draws them. */
export const GUIDE_SORT_COLUMNS = [
  "title",
  "status",
  "listings",
  "updated",
] as const

export type GuideSortColumn = (typeof GUIDE_SORT_COLUMNS)[number]

/** Words read A to Z; counts and dates start biggest and newest first. */
export function guideSortDirection(column: GuideSortColumn): "asc" | "desc" {
  return column === "title" || column === "status" ? "asc" : "desc"
}

/** "9 places", the line under a guide's card and in its share card. */
export function guidePlacesText(count: number): string {
  return count === 1 ? "1 place" : `${count} places`
}

export function guideShareImagePath(slug: string, version: string): string {
  return `/guides/share-image/${encodeURIComponent(slug)}?v=${encodeURIComponent(version)}`
}

export function guideShareImageUrl(
  siteUrl: string,
  slug: string,
  version: string
): string {
  return new URL(guideShareImagePath(slug, version), siteUrl).toString()
}
