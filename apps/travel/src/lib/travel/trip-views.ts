import { savedViewScreen, type SavedViewValues } from "@/lib/saved-views"
import { DAY_PART_LABEL } from "@/lib/travel/rules"
import { readTripFilters } from "@/lib/travel/trip-search"

/**
 * Saved views on a trip's board (task part 17): a person's own named filters,
 * kept by the shell under `trip:<trip id>`. A view keeps the activity type,
 * the search, and since More Travel features part 11 Done, Part of the day,
 * No place yet, Cost and Must do.
 */
export const TRIP_VIEW_KIND = "trip"

export function tripViewScreen(tripId: string) {
  return savedViewScreen(TRIP_VIEW_KIND, tripId)
}

/** Only the filters set, each checked, so a view never holds something the page can't read. */
export function keptTripFilters(filters: SavedViewValues): SavedViewValues {
  const kept: SavedViewValues = {}
  for (const [key, value] of Object.entries(readTripFilters(filters))) {
    if (typeof value === "string") kept[key] = key === "q" ? value.trim() : value
  }
  return kept
}

/** "Food · Not done · Morning · "temple"": what a view shows, said before it is opened. */
export function describeTripView(filters: SavedViewValues, names: Record<string, string>) {
  const read = readTripFilters(filters)
  const parts: string[] = []
  if (read.type) parts.push(names.type ?? "A type that was removed")
  if (read.done) parts.push(read.done === "done" ? "Done" : "Not done")
  if (read.part) parts.push(DAY_PART_LABEL[read.part])
  if (read.place) parts.push("No place yet")
  if (read.cost) parts.push(read.cost === "yes" ? "Has a cost" : "No cost")
  if (read.must) parts.push("Must do")
  if (read.q) parts.push(`"${read.q.trim()}"`)
  return parts.join(" · ")
}
