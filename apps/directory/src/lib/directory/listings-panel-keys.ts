/**
 * Where the Listings dashboard remembers things in this browser. Kept here
 * rather than in the shell's `panelLayoutKey` list, because that list is a
 * shell file and an app never edits one. The number on a layout key is
 * bumped whenever the default widths move.
 */

/** The three-panel layout every row but Overview shares. */
export const LISTINGS_DASHBOARD_LAYOUT_KEY = "directory-listings-dashboard-horizontal-1"

/** Overview's two panels, the left page and the widgets. */
export const LISTINGS_OVERVIEW_LAYOUT_KEY = "directory-listings-overview-horizontal-1"

/** Where the dashboard was: its row, filters and open record. */
export const LISTINGS_PLACE_KEY = "directory-listings-place"

/** The left page's read, kept between visits so coming back draws it at once. */
export const LISTINGS_PAGE_READ = "directory-listings-page"

/**
 * Each row's own filters, remembered per person and site in this browser
 * (Tyler's polish pick, 18 Nov 2026: "Status and View range become one
 * Filter button, remembered per person and site"), so going back to a row
 * from the Dashboards block brings its filters back.
 */
export function listingsFilterKey(userId: string, workspaceId: string, section: string) {
  return `directory-listings-filter:${userId}:${workspaceId}:${section}`
}
