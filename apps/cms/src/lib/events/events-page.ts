import {
  isValidDateString,
  parseYearMonth,
  toMonthString,
} from "@/lib/events/calendar-grid"
import { readOneOf, readPage } from "@/lib/nav/list-search"

/**
 * The Events page's state, named once so the route's address reader, the
 * endpoint and the links between views agree on what may appear in the
 * address: `?view=month&month=2026-10`, or `?day=2026-10-03`, or `?page=2`.
 */

export const EVENT_VIEWS = ["list", "month"] as const

export type EventView = (typeof EVENT_VIEWS)[number]

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
}

/**
 * The address's state. Anything unexpected falls back to the plain list, and a
 * month given as a whole day, "2026-10-03", is read as "2026-10".
 */
export function readEventsSearch(
  search: Record<string, unknown>
): EventsPageSearch {
  if (readOneOf(search.view, EVENT_VIEWS) === "month") {
    const month = parseYearMonth(search.month)
    return { view: "month", month: month ? toMonthString(month) : undefined }
  }
  if (isValidDateString(search.day)) return { day: search.day }
  return { page: readPage(search.page) }
}
