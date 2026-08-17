/**
 * The public directory's list state, named once so the route's address reader,
 * the endpoint and the toolbar all agree on what may appear in the URL.
 *
 * Separate from `listing-sort.ts` on purpose. That one is the admin's list —
 * it sorts by status and by when a row was last edited, neither of which means
 * anything to a visitor, and it has a draft filter a public page must never
 * offer. Sharing the two would mean one list of columns that half the callers
 * had to be told to ignore.
 */

import type { DirectoryView } from "@/lib/directory/listing-map"

/** How a visitor may order the list. The first one is the default. */
export const DIRECTORY_SORTS = ["order", "newest", "title", "distance"] as const
export const DIRECTORY_DEFAULT_SORTS = ["order", "newest", "title"] as const

export type DirectorySort = (typeof DIRECTORY_SORTS)[number]

export function isDirectorySort(value: unknown): value is DirectorySort {
  return (
    typeof value === "string" &&
    DIRECTORY_SORTS.includes(value as DirectorySort)
  )
}

export type DirectoryDefaultSort = (typeof DIRECTORY_DEFAULT_SORTS)[number]

export function isDirectoryDefaultSort(
  value: unknown
): value is DirectoryDefaultSort {
  return (
    typeof value === "string" &&
    DIRECTORY_DEFAULT_SORTS.includes(value as DirectoryDefaultSort)
  )
}

/**
 * `order` is the hand-set order an admin gives listings on the edit form, and
 * it is the default because that field exists for exactly this list. Ties fall
 * back to newest-first, so a directory where nobody has set an order still
 * reads sensibly.
 */
export const DIRECTORY_SORT_LABELS: Record<DirectorySort, string> = {
  order: "Recommended",
  newest: "Newest",
  title: "A to Z",
  distance: "Nearest",
}

/**
 * What the browse page's address may carry.
 *
 * Every key is optional, and that is load-bearing rather than tidy: a route
 * whose search keys are required makes every `<Link>` to it spell all four out,
 * including the three it does not care about. Optional keys mean a link that
 * only wants to change the category says only that.
 */
export type DirectoryBrowseSearch = {
  q?: string
  category?: string
  sort?: DirectorySort
  page?: number
  /** Rounded browser location only; never a precise position. */
  near?: string
  /** A human-readable place name, when the visitor typed one. */
  place?: string
  radius?: number
  /**
   * Grid or map. In the address rather than in memory so a map somebody sends
   * opens as a map, which is the whole reason for having the switch.
   */
  view?: DirectoryView
}

export const DIRECTORY_NEAR_RADII_KM = [5, 10, 25, 50] as const
export const DEFAULT_DIRECTORY_NEAR_RADIUS_KM = 10

export type DirectoryNearPoint = { latitude: number; longitude: number }

/** Three decimals is about 110 metres: useful nearby without sharing a doorstep. */
export function parseDirectoryNearPoint(
  value: unknown
): DirectoryNearPoint | null {
  if (typeof value !== "string") return null
  const [rawLatitude, rawLongitude, ...rest] = value.split(",")
  if (rest.length || rawLatitude === undefined || rawLongitude === undefined)
    return null
  const latitude = Number(rawLatitude)
  const longitude = Number(rawLongitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
    return null
  return {
    latitude: roundNearCoordinate(latitude),
    longitude: roundNearCoordinate(longitude),
  }
}

export function formatDirectoryNearPoint(point: DirectoryNearPoint) {
  return `${roundNearCoordinate(point.latitude)},${roundNearCoordinate(point.longitude)}`
}

export function readDirectoryNearRadius(value: unknown) {
  const radius = typeof value === "number" ? value : Number(value)
  return DIRECTORY_NEAR_RADII_KM.includes(
    radius as (typeof DIRECTORY_NEAR_RADII_KM)[number]
  )
    ? radius
    : undefined
}

function roundNearCoordinate(value: number) {
  return Math.round(value * 1_000) / 1_000
}

export function formatDirectoryDistance(distanceKm: number | null | undefined) {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0)
    return ""
  if (distanceKm < 0.1) return "Nearby"
  if (distanceKm < 1) return `${Math.round(distanceKm * 10) * 100} m away`
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km away`
  return `${Math.round(distanceKm)} km away`
}

/** How many "you might also like" listings a detail page shows. */
export const RELATED_LISTING_COUNT = 3
