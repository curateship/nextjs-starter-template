/**
 * Where the Projects dashboard remembers things in this browser. Kept here
 * rather than in the shell's `panelLayoutKey` list, because that list is a
 * shell file and an app never edits one. The number on a layout key is
 * bumped whenever the default widths move.
 */

/** The three-panel layout every section but Overview shares. */
export const PROJECTS_DASHBOARD_LAYOUT_KEY = "promo-projects-dashboard-horizontal-1"

/** Overview's two panels, the left page and the widgets. */
export const PROJECTS_OVERVIEW_LAYOUT_KEY = "promo-projects-overview-horizontal-1"

/** Where the dashboard was: its section, project, filters and open row. */
export const PROJECTS_PLACE_KEY = "promo-projects-place"
