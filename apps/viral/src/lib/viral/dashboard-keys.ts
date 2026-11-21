/**
 * Where the Viral dashboard remembers things in this browser, the same way
 * Directory's Events dashboard does (`events-panel-keys.ts`). The number on
 * a layout key is bumped whenever the default widths move.
 */

export const VIRAL_DASHBOARD_LAYOUT_KEY = "viral-dashboard-horizontal-1"
export const VIRAL_OVERVIEW_LAYOUT_KEY = "viral-overview-horizontal-1"
/** Where the dashboard was: its row, filters and open record. */
export const VIRAL_PLACE_KEY = "viral-dashboard-place"
/** The left page's read, kept between visits so coming back draws it at once. */
export const VIRAL_PAGE_READ = "viral-dashboard-page"
