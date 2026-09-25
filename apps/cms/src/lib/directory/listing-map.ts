/**
 * The browse page's map view, in the parts that are only arithmetic and
 * wording. No imports, so the route, the endpoint, the toolbar and the tests
 * can all read the same numbers.
 */

/**
 * The most pins one map will ever draw.
 *
 * Same number the directory app uses, for the same two reasons. A map that
 * quietly drops half the results is worse than no map, so anything over this is
 * said out loud; and a map asked to draw four thousand markers locks the tab.
 */
export const DIRECTORY_MAP_LISTING_LIMIT = 100

/** The two ways the browse page can draw its results. The first is default. */
export const DIRECTORY_VIEWS = ["grid", "map"] as const

export type DirectoryView = (typeof DIRECTORY_VIEWS)[number]

export const DIRECTORY_VIEW_LABELS: Record<DirectoryView, string> = {
  grid: "Grid",
  map: "Map",
}

/**
 * The line above a capped map, or nothing at all when it is not capped.
 *
 * At exactly the limit there is no sentence: every result is on the map, and
 * telling somebody "showing 100 of 100" is noise. At one more than the limit
 * there is, because now something is missing and they need to know.
 */
export function directoryMapCapNotice(
  shown: number,
  total: number
): string | null {
  if (total <= shown) return null
  return `Showing ${shown} of ${total} listings on the map. Search or pick a category to narrow it down.`
}

/** The centre of a set of points, so a map with no pins still opens somewhere. */
export function directoryMapCentre(
  points: { latitude: number; longitude: number }[]
): { latitude: number; longitude: number } | null {
  if (points.length === 0) return null
  let latitude = 0
  let longitude = 0
  for (const point of points) {
    latitude += point.latitude
    longitude += point.longitude
  }
  return {
    latitude: latitude / points.length,
    longitude: longitude / points.length,
  }
}
