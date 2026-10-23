/**
 * The browse page's map view, in the parts that are only arithmetic, wording
 * and the one drawing. No imports, so the route, the endpoint, the toolbar and
 * the tests can all read the same numbers.
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

/**
 * What the map's deal switch can be narrowed to. Absent is every listing, so
 * the ordinary map keeps the address it always had.
 */
export const DIRECTORY_DEAL_FILTERS = ["only"] as const

export type DirectoryDealFilter = (typeof DIRECTORY_DEAL_FILTERS)[number]

/**
 * The words on the switch. Named once because the sentence a narrowed map with
 * no pins shows tells the visitor to switch it off by name, and the two would
 * drift apart the first time one of them was reworded.
 */
export const DIRECTORY_DEALS_ONLY_LABEL = "Deals only"

/**
 * The deal marker: a pin in its own colour with a per-cent sign in it, drawn
 * here as an SVG so Google's map can use it as a marker image.
 *
 * **The colours are written out rather than read from the theme, and that is
 * deliberate.** Google's map tiles are the same light grey, roads and all, in
 * dark mode as in light, because this app never asks Google for a dark map. A
 * marker painted in a theme colour would therefore turn pale on a pale map the
 * moment somebody switched the site to dark. A fixed indigo with a white
 * outline reads on those tiles either way, and it is a deliberate drawing on a
 * picture, the same exemption a chart's annotation has.
 *
 * Indigo rather than red: Google's own default marker is red, so the two have
 * to differ at a glance. The per-cent sign is the second difference, because a
 * colour on its own is not something to tell a visitor anything with.
 *
 * 28 by 40, and Google anchors an image marker at the bottom centre, so the
 * tip of the pin at (14, 40) is the spot on the map.
 */
export const DEAL_MARKER_ICON = dealMarkerIcon()

function dealMarkerIcon(): string {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">`,
    `<path d="M14 1C7.4 1 2 6.4 2 13c0 8.4 12 26 12 26s12-17.6 12-26C26 6.4 20.6 1 14 1Z" fill="#4338ca" stroke="#ffffff" stroke-width="2"/>`,
    `<path d="M17.5 9.5 10.5 16.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>`,
    `<circle cx="11" cy="10.5" r="1.7" fill="#ffffff"/>`,
    `<circle cx="17" cy="15.5" r="1.7" fill="#ffffff"/>`,
    `</svg>`,
  ].join("")
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * What a pin says when somebody hovers it or reaches it with a keyboard. The
 * headline rides along, so the deal is readable without opening the card and
 * without having to tell the two pin colours apart.
 */
export function directoryPinLabel(
  title: string,
  dealHeadline: string | undefined
): string {
  return dealHeadline ? `${title}, ${dealHeadline}` : title
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
