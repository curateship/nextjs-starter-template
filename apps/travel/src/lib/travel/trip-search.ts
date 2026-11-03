import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

export const TRIP_VIEWS = ["board", "list", "calendar", "map"] as const
export type TripView = (typeof TRIP_VIEWS)[number]

/**
 * What the trip page's address holds, so a reload or a pasted link opens the
 * same thing: the open activity, the view, and the board's filter by type
 * and search (task part 17).
 */
export type TripSearch = {
  open?: string
  view?: TripView
  /** One activity type's id. */
  type?: string
  /** Words to find in an activity's name or place. */
  q?: string
}

/** Every value is checked against a fixed list or a length, so a hand-edited address falls back to the default. */
export function readTripSearch(search: Record<string, unknown>): TripSearch {
  const result: TripSearch = {}
  const { open } = readOpenSearch(search)
  if (open) result.open = open
  if (typeof search.view === "string" && (TRIP_VIEWS as readonly string[]).includes(search.view)) {
    result.view = search.view as TripView
  }
  if (typeof search.type === "string" && search.type.length > 0 && search.type.length <= 36) result.type = search.type
  if (typeof search.q === "string" && search.q.trim()) result.q = search.q.slice(0, 100)
  return result
}

/** The activities a filter leaves, for every view of the trip. */
export function filterActivities<
  T extends { typeId: string | null; title: string; place: { name: string; address: string } | null },
>(activities: readonly T[], search: TripSearch): T[] {
  const needle = search.q?.trim().toLowerCase()
  return activities.filter((activity) => {
    if (search.type && activity.typeId !== search.type) return false
    if (needle) {
      const text = `${activity.title} ${activity.place?.name ?? ""} ${activity.place?.address ?? ""}`.toLowerCase()
      if (!text.includes(needle)) return false
    }
    return true
  })
}

/** How many filters are set, for the Filter button's count. The search is counted by its own box. */
export function filterCount(search: TripSearch) {
  return search.type ? 1 : 0
}
