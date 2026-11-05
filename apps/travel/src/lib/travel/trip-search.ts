import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { DAY_PARTS, partOfTime, type DayPart } from "@/lib/travel/rules"

export const TRIP_VIEWS = ["board", "list", "calendar", "map", "photos"] as const
export type TripView = (typeof TRIP_VIEWS)[number]

/** Done or still to do (More Travel features part 11). */
export const DONE_FILTERS = ["done", "todo"] as const
export type DoneFilter = (typeof DONE_FILTERS)[number]

/** A cost typed, or none yet (More Travel features part 11). */
export const COST_FILTERS = ["yes", "no"] as const
export type CostFilter = (typeof COST_FILTERS)[number]

/**
 * What the trip page's address holds, so a reload or a pasted link opens the
 * same thing: the open activity, the view, and the board's filters and
 * search (task part 17, and More Travel features part 11).
 */
export type TripSearch = {
  open?: string
  view?: TripView
  /** One activity type's id. */
  type?: string
  /** Words to find in an activity's name or place. */
  q?: string
  /** Done, or still to do. */
  done?: DoneFilter
  /** Morning, Afternoon, Evening or Night: a timed card counts by its hour. */
  part?: DayPart
  /** "none": only cards with no address and no Google place. */
  place?: "none"
  /** "yes": a cost typed; "no": none yet. */
  cost?: CostFilter
  /** "yes": only Must do cards (More Travel features part 4). */
  must?: "yes"
}

/** Each filter's address key, for clearing them all at once. Search and the view aren't filters. */
export const TRIP_FILTER_KEYS = ["type", "done", "part", "place", "cost", "must"] as const satisfies readonly (keyof TripSearch)[]

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined =>
  typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : undefined

/** The filters in a set of values, each checked against its fixed list or a length. */
export function readTripFilters(values: Record<string, unknown>) {
  const result: Pick<TripSearch, (typeof TRIP_FILTER_KEYS)[number] | "q"> = {}
  if (typeof values.type === "string" && values.type.length > 0 && values.type.length <= 36) result.type = values.type
  if (typeof values.q === "string" && values.q.trim()) result.q = values.q.slice(0, 100)
  const done = oneOf(DONE_FILTERS, values.done)
  if (done) result.done = done
  const part = oneOf(DAY_PARTS, values.part)
  if (part) result.part = part
  if (values.place === "none") result.place = "none"
  const cost = oneOf(COST_FILTERS, values.cost)
  if (cost) result.cost = cost
  if (values.must === "yes") result.must = "yes"
  return result
}

/** Every value is checked against a fixed list or a length, so a hand-edited address falls back to the default. */
export function readTripSearch(search: Record<string, unknown>): TripSearch {
  const result: TripSearch = { ...readTripFilters(search) }
  const { open } = readOpenSearch(search)
  if (open) result.open = open
  const view = oneOf(TRIP_VIEWS, search.view)
  if (view) result.view = view
  return result
}

type Filterable = {
  typeId: string | null
  title: string
  place: { name: string; address: string; placeId?: string | null } | null
  done?: boolean
  startTime?: string | null
  dayPart?: DayPart | null
  costCents?: number | null
  mustDo?: boolean
}

/** The part of the day a card falls in: its hour's part when timed, else the part it was set to. */
function partOf(activity: Filterable) {
  return activity.startTime ? partOfTime(activity.startTime) : (activity.dayPart ?? null)
}

/** The activities a filter leaves, for every view of the trip. */
export function filterActivities<T extends Filterable>(activities: readonly T[], search: TripSearch): T[] {
  const needle = search.q?.trim().toLowerCase()
  return activities.filter((activity) => {
    if (search.type && activity.typeId !== search.type) return false
    if (search.done && Boolean(activity.done) !== (search.done === "done")) return false
    if (search.part && partOf(activity) !== search.part) return false
    if (search.place === "none" && (activity.place?.address?.trim() || activity.place?.placeId)) return false
    if (search.cost && (activity.costCents != null) !== (search.cost === "yes")) return false
    if (search.must === "yes" && !activity.mustDo) return false
    if (needle) {
      const text = `${activity.title} ${activity.place?.name ?? ""} ${activity.place?.address ?? ""}`.toLowerCase()
      if (!text.includes(needle)) return false
    }
    return true
  })
}

/** How many filters are set, for the Filter button's count. The search is counted by its own box. */
export function filterCount(search: TripSearch) {
  return TRIP_FILTER_KEYS.filter((key) => search[key] !== undefined).length
}
