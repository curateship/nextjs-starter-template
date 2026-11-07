/**
 * Where Travel's screens remember things in this browser. Kept here rather
 * than in the shell's `panelLayoutKey` list, because that list is a shell
 * file and an app never edits one.
 *
 * The number on a layout key is bumped whenever the default widths move, so
 * browsers that kept the old widths start from the new ones.
 */
export const TRIP_PANEL_LAYOUT_KEY = "travel-trip-horizontal-1"

/**
 * Where a trip page was: its open activity, view and filters. One per trip,
 * so arriving at one trip never puts back another trip's filters.
 */
export const tripPlaceKey = (tripId: string) => `travel-trip-place-${tripId}`

/** Board, List, Calendar or Map, remembered per person in this browser. */
export const TRIP_VIEW_KEY = "travel-trip-view"

/** The board's Compact cards switch. */
export const COMPACT_CARDS_KEY = "travel-compact-cards"

/** The day columns folded shut on a trip. */
export const foldedDaysKey = (tripId: string) => `travel-folded-days-${tripId}`

/** Whether the Trips table shows the places-visited map. */
export const TRIPS_MAP_KEY = "travel-trips-map"
/** Which pins the Trips map shows: each trip's destination, or every place done (Travel features 3, part 12). */
export const TRIPS_MAP_PINS_KEY = "travel-trips-map-pins"

/** Whether a trip's Ideas column is hidden behind its eye. */
export const hiddenIdeasKey = (tripId: string) => `travel-hidden-ideas-${tripId}`

/** The Money card's By day or By type (More Travel features part 13). */
export const MONEY_VIEW_KEY = "travel-money-view"

/** The days folded shut on a trip's List tab, apart from the board's folded columns. */
export const listFoldsKey = (tripId: string) => `travel-list-folds-${tripId}`
