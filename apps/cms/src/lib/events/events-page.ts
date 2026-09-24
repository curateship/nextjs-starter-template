import {
  isValidDateString,
  parseYearMonth,
  toMonthString,
} from "@/lib/events/calendar-grid"
import { addDays, weekdayOf } from "@/lib/events/event-repeat"
import { formatEventShortDay } from "@/lib/events/event-time"
import { slugProblem } from "@/lib/directory/slugs"
import { readOneOf, readPage } from "@/lib/nav/list-search"

/**
 * The Events page's state, named once so the route's address reader, the
 * endpoint and the links between views agree on what may appear in the
 * address: `?view=month&month=2026-10`, or `?day=2026-10-03`, or `?page=2`,
 * or `?place=the-rex` for the events held at one listing. `?category=` works
 * on every view. `?when=weekend`, or `?from=` and `?to=`, narrow the list.
 */

export const EVENT_VIEWS = ["list", "month"] as const

export type EventView = (typeof EVENT_VIEWS)[number]

/** The date filters with a button of their own. A range is the fourth kind. */
export const EVENT_DATE_FILTERS = ["today", "weekend", "week"] as const

type EventDateFilter = (typeof EVENT_DATE_FILTERS)[number]

export const EVENT_DATE_FILTER_LABELS: Record<EventDateFilter, string> = {
  today: "Today",
  weekend: "This weekend",
  week: "Next 7 days",
}

/** How many upcoming events one page of the list shows, the same as posts. */
export const EVENTS_PAGE_SIZE = 12

/** A month cell shows this many events, then "+2 more". */
export const EVENTS_PER_DAY_CELL = 3

/** One day's list is never paged; a day with more than this is cut here. */
export const MAX_EVENTS_ON_A_DAY = 100

export type EventsPageSearch = {
  /** Absent means the list, which is what the page opens on. */
  view?: EventView
  /** "2026-10", month view only. Absent means the site's current month. */
  month?: string
  /** "2026-10-03": the list narrowed to that one day. */
  day?: string
  page?: number
  /** A listing's address, like "the-rex": the list narrowed to that place. */
  place?: string
  /** A category's address, like "live-music", on any view. */
  category?: string
  /** List only. A named stretch of days, by the site's calendar. */
  when?: EventDateFilter
  /** List only, and only without `when`: the first day of a range. */
  from?: string
  /** List only, and only without `when`: the last day of a range. */
  to?: string
}

/** The date filter part of the address, which the list's links carry. */
export type EventDateSearch = Pick<EventsPageSearch, "when" | "from" | "to">

/** An address that could be a category's or a listing's, or nothing. */
function readSlug(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 160 && !slugProblem(value)
    ? value
    : undefined
}

/**
 * `when` wins over a range when a hand-typed address has both. A range typed
 * backwards is read the right way round, and a range end that is not a real
 * day is dropped.
 */
export function readEventDateFilter(
  search: Record<string, unknown>
): EventDateSearch {
  const when = readOneOf(search.when, EVENT_DATE_FILTERS)
  if (when) return { when }
  const from = isValidDateString(search.from) ? search.from : undefined
  const to = isValidDateString(search.to) ? search.to : undefined
  return from && to && from > to ? { from: to, to: from } : { from, to }
}

/**
 * The address's state. Anything unexpected falls back to the plain list, and a
 * month given as a whole day, "2026-10-03", is read as "2026-10".
 */
export function readEventsSearch(
  search: Record<string, unknown>
): EventsPageSearch {
  const category = readSlug(search.category)
  if (readOneOf(search.view, EVENT_VIEWS) === "month") {
    const month = parseYearMonth(search.month)
    return {
      view: "month",
      month: month ? toMonthString(month) : undefined,
      category,
    }
  }
  if (isValidDateString(search.day)) return { day: search.day, category }
  return {
    page: readPage(search.page),
    place: readSlug(search.place),
    category,
    ...readEventDateFilter(search),
  }
}

/** The days a date filter covers, both included. A missing end is open. */
type EventDateWindow = { from?: string; to?: string }

/**
 * The days a date filter covers on the site's calendar, from the site's
 * today. Null when there is no date filter.
 *
 * "This weekend" is Saturday and Sunday. From Monday to Friday it is the
 * coming Saturday and Sunday. On Saturday it is today and tomorrow, and on
 * Sunday it is the rest of today, never the weekend after. The list only
 * holds events that are not over yet, so "today" is the rest of today too.
 */
export function eventDateWindow(
  search: EventDateSearch,
  today: string
): EventDateWindow | null {
  if (search.when === "today") return { from: today, to: today }
  if (search.when === "week") return { from: today, to: addDays(today, 6) }
  if (search.when === "weekend") {
    const weekday = weekdayOf(today)
    if (weekday === 0) return { from: today, to: today }
    const saturday = addDays(today, 6 - weekday)
    return { from: saturday, to: addDays(saturday, 1) }
  }
  if (search.from || search.to) return { from: search.from, to: search.to }
  return null
}

/**
 * The date filter in words, to finish "Nothing is on …": "today",
 * "this weekend", "in the next 7 days", "from Sat, Oct 3 to Sun, Oct 4",
 * "from Sat, Oct 3" or "until Sun, Oct 4". Empty with no date filter.
 */
export function eventDateFilterText(search: EventDateSearch): string {
  if (search.when === "today") return "today"
  if (search.when === "weekend") return "this weekend"
  if (search.when === "week") return "in the next 7 days"
  if (search.from && search.to && search.from === search.to) {
    return `on ${formatEventShortDay(search.from)}`
  }
  if (search.from && search.to) {
    return `from ${formatEventShortDay(search.from)} to ${formatEventShortDay(search.to)}`
  }
  if (search.from) return `from ${formatEventShortDay(search.from)}`
  if (search.to) return `until ${formatEventShortDay(search.to)}`
  return ""
}

/** The list's address for a search, leaving out what is the default. */
export function eventsListHref(search: EventsPageSearch): string {
  const params = new URLSearchParams()
  if (search.place) params.set("place", search.place)
  if (search.category) params.set("category", search.category)
  if (search.when) params.set("when", search.when)
  if (search.from) params.set("from", search.from)
  if (search.to) params.set("to", search.to)
  if (search.page && search.page > 1) params.set("page", String(search.page))
  const query = params.toString()
  return query ? `/events?${query}` : "/events"
}
