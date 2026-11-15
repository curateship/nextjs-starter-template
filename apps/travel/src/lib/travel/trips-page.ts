import { withFixedBlock } from "@/lib/notes/fixed-block"
import type { NoteNode } from "@/lib/notes/note-blocks"

/**
 * The Trips dashboard's left page, one per person (Tyler, 12 Nov 2026: "The
 * left panel can have the dashboard block that list Overview widgets, trips,
 * places"). Its own "/" blocks keep no values: each draws what the dashboard
 * already knows. The editor and the server both clean a page with this list,
 * so a block missing here is dropped on save.
 */
export const TRIPS_PAGE_BLOCK_TYPES = ["noteTripsSections", "noteTripsTags"] as const

/**
 * The Dashboards block: Overview, Trips and Places, one row each. Fixed, as
 * the Admin and CRM pages' are: never offered in the "/" list, the editor
 * refuses to take it off, the server puts it back at the top of a page saved
 * without it, and its ⋮ moves it up and down.
 */
export const TRIPS_SECTIONS_NODE = "noteTripsSections"

/** The Tags block: every tag on the person's trips, each narrowing the Trips table. */
export const TRIPS_TAGS_NODE = "noteTripsTags"

/** A page nobody has written on: the Dashboards block, then Tags. */
export function defaultTripsPage(): NoteNode {
  return {
    type: "doc",
    content: [{ type: TRIPS_SECTIONS_NODE }, { type: TRIPS_TAGS_NODE }, { type: "paragraph" }],
  }
}

/** The page with its one Dashboards block (`withFixedBlock`). */
export function withTripsSectionsBlock(body: NoteNode): NoteNode {
  return withFixedBlock(body, TRIPS_SECTIONS_NODE)
}
