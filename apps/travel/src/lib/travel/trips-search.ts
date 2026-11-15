import { readDirection, readOneOf, readSearchText } from "@/lib/nav/list-search"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

/**
 * What the Trips dashboard's address holds (Tyler, 12 Nov 2026: "one
 * cohesive 3 panel design"), so a reload, Back or a pasted link opens the
 * same section, tab, filters and open record. Trips is the section with no
 * `section`, so the older `/trips?show=bin` links still land on its Bin.
 */

export const TRIPS_SECTIONS = ["overview", "trips", "places"] as const
export type TripsSection = (typeof TRIPS_SECTIONS)[number]

export const TRIPS_SECTION_LABELS: Record<TripsSection, string> = {
  overview: "Overview",
  trips: "Trips",
  places: "Places",
}

/** The Trips section's tabs; Upcoming has no `show`. */
export const TRIP_TABS = ["upcoming", "past", "archived", "bin"] as const
export type TripTab = (typeof TRIP_TABS)[number]

/** The Places section's tabs; Saved has no `tab`. */
export const PLACE_TABS = ["saved", "again", "been", "bin"] as const
export type PlaceTab = (typeof PLACE_TABS)[number]

export const PLACE_TAB_LABELS: Record<PlaceTab, string> = {
  saved: "Saved",
  again: "Go again",
  been: "Been",
  bin: "Bin",
}

/** How Places folds its rows: by the trip each came from, or by type. */
export const PLACE_GROUPS = ["trip", "type"] as const
export type PlaceGroup = (typeof PLACE_GROUPS)[number]

/** How Places orders its rows; newest first when none is picked. */
export const PLACE_SORTS = ["name", "stars", "last"] as const
export type PlaceSort = (typeof PLACE_SORTS)[number]

export const PLACE_SORT_LABELS: Record<PlaceSort | "newest", string> = {
  newest: "Newest first",
  name: "Name, A to Z",
  stars: "Most stars first",
  last: "Last time you went",
}

/** The Trips table's sortable columns; Dates when absent. */
export const TRIP_ORDERS = ["name", "days", "status", "rating"] as const

export type TripsSearch = {
  section?: Exclude<TripsSection, "trips">
  /** The Trips tab: Past, Archived or Bin; Upcoming when absent. */
  show?: Exclude<TripTab, "upcoming">
  /** The Places tab: Go again, Been or Bin; Saved when absent. */
  tab?: Exclude<PlaceTab, "saved">
  /** Words to find, in the section showing. */
  q?: string
  /** One tag: the Trips table shows only trips with it (the Tags block, and Filter). */
  tag?: string
  /** One activity type's id: Places shows only places of that type. */
  type?: string
  group?: PlaceGroup
  sort?: PlaceSort
  /** The Trips table's column sorted by, and which way; Dates soonest first when absent. */
  order?: (typeof TRIP_ORDERS)[number]
  direction?: "asc" | "desc"
  /** The trip or place open on the right. */
  open?: string
}

/** The address read safely: anything unknown falls back to the default. */
export function readTripsSearch(search: Record<string, unknown>): TripsSearch {
  const section = readOneOf(search.section, ["overview", "places"] as const)
  const show = readOneOf(search.show, ["past", "archived", "bin"] as const)
  const tab = readOneOf(search.tab, ["again", "been", "bin"] as const)
  const tag = readSearchText(search.tag)
  const type = readSearchText(search.type)
  return {
    ...(section ? { section } : {}),
    ...(show ? { show } : {}),
    ...(tab ? { tab } : {}),
    ...(readSearchText(search.q) ? { q: readSearchText(search.q) } : {}),
    ...(tag ? { tag } : {}),
    ...(type ? { type } : {}),
    ...(readOneOf(search.group, PLACE_GROUPS) ? { group: readOneOf(search.group, PLACE_GROUPS) } : {}),
    ...(readOneOf(search.sort, PLACE_SORTS) ? { sort: readOneOf(search.sort, PLACE_SORTS) } : {}),
    ...(readOneOf(search.order, TRIP_ORDERS) ? { order: readOneOf(search.order, TRIP_ORDERS) } : {}),
    ...(readDirection(search.direction) ? { direction: readDirection(search.direction) } : {}),
    ...readOpenSearch(search),
  }
}

export function sectionOf(search: TripsSearch): TripsSection {
  return search.section ?? "trips"
}

/**
 * The address for a section picked in the Dashboards block: a fresh start in
 * that section, with nothing of the last one's search or open record.
 */
export function sectionSearch(section: TripsSection, extra: Partial<TripsSearch> = {}): TripsSearch {
  return { ...(section === "trips" ? {} : { section }), ...extra }
}
