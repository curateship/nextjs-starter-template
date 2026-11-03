import { savedViewScreen, type SavedViewValues } from "@/lib/saved-views"

/**
 * Saved views on a trip's board (task part 17): a person's own named filters,
 * kept by the shell under `trip:<trip id>`. A view keeps the activity type,
 * and the search.
 */
export const TRIP_VIEW_KIND = "trip"

export function tripViewScreen(tripId: string) {
  return savedViewScreen(TRIP_VIEW_KIND, tripId)
}

/** Only the filters set, each checked, so a view never holds something the page can't read. */
export function keptTripFilters(filters: SavedViewValues): SavedViewValues {
  const kept: SavedViewValues = {}
  if (typeof filters.type === "string" && filters.type.length > 0 && filters.type.length <= 36) kept.type = filters.type
  if (typeof filters.q === "string" && filters.q.trim()) kept.q = filters.q.trim().slice(0, 100)
  return kept
}

/** "Food · "temple"": what a view shows, said before it is opened. */
export function describeTripView(filters: SavedViewValues, names: Record<string, string>) {
  const parts: string[] = []
  if (typeof filters.type === "string") parts.push(names.type ?? "A type that was removed")
  if (typeof filters.q === "string") parts.push(`"${filters.q}"`)
  return parts.filter(Boolean).join(" · ")
}
