import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { EVENT_SORT_COLUMNS, readEventViewRange, type EventSortColumn, type EventViewRange } from "@/lib/events/event-sort"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readDirection, readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"

/**
 * What the Events dashboard's address holds (task events/37, Part 1), so a
 * reload, Back or a pasted link opens the same row, the same tab and filters,
 * and the same open record. Events is the row with no `section`, so
 * `/admin/events` alone lands on it, and an old `?open=<id>` link still opens
 * that event.
 *
 * The rows (Tyler, 19 Nov 2026: "Overview widgets, Sign-ups, Featured
 * events", besides Events itself). Event submissions stays a page of its own.
 */

export const EVENTS_SECTIONS = ["overview", "events", "signups", "featured"] as const
export type EventsSection = (typeof EVENTS_SECTIONS)[number]

/** A row the Dashboards block can hide or move: every one but Overview. */
export type EventsListSection = Exclude<EventsSection, "overview">
export const EVENTS_LIST_SECTIONS: readonly EventsListSection[] = ["events", "signups", "featured"]

export const EVENTS_SECTION_LABELS: Record<EventsSection, string> = {
  overview: "Overview",
  events: "Events",
  signups: "Sign-ups",
  featured: "Featured events",
}

/** The Events row's header tabs, Upcoming first, the one it opens on. */
export const EVENT_TABS = ["upcoming", "past", "draft"] as const
export type EventTab = (typeof EVENT_TABS)[number]
export const EVENT_TAB_LABELS: Record<EventTab, string> = { upcoming: "Upcoming", past: "Past", draft: "Draft" }

/** The Sign-ups row's filter: who is coming, who is waiting, or both. */
export const SIGN_UP_FILTERS = ["coming", "waiting", "all"] as const
export type SignUpFilter = (typeof SIGN_UP_FILTERS)[number]
export const SIGN_UP_FILTER_LABELS: Record<SignUpFilter, string> = {
  coming: "Coming",
  waiting: "Waiting for a seat",
  all: "Everyone",
}

/** The Featured events row's filter: spots running now, or ended ones too. */
export const FEATURED_FILTERS = ["running", "all"] as const
export type FeaturedFilter = (typeof FEATURED_FILTERS)[number]

export type EventsSearch = {
  section?: Exclude<EventsSection, "events">
  /** The record open on the right. */
  open?: string
  q?: string
  /** Events: Upcoming (the default), Past or Draft. */
  tab?: Exclude<EventTab, "upcoming">
  /** Events: one category, picked in the Categories block. */
  category?: string
  sort?: EventSortColumn
  direction?: "asc" | "desc"
  /** Events: the range the Views column counts. */
  days?: EventViewRange
  /** Sign-ups: coming (the default), waiting or everyone. */
  who?: Exclude<SignUpFilter, "coming">
  /** Featured events: running (the default) or every spot. */
  spots?: Exclude<FeaturedFilter, "running">
  page?: number
  size?: number
}

const ID = /^[A-Za-z0-9-]{1,36}$/

/** The address read safely: anything unknown falls back to the default. */
export function readEventsDashboardSearch(search: Record<string, unknown>): EventsSearch {
  const out: EventsSearch = {}
  const section = readOneOf(search.section, EVENTS_SECTIONS)
  if (section && section !== "events") out.section = section
  const { open } = readOpenSearch(search)
  if (open && ID.test(open)) out.open = open
  const q = readSearchText(search.q)
  if (q) out.q = q
  const tab = readOneOf(search.tab, EVENT_TABS)
  if (tab && tab !== "upcoming") out.tab = tab
  if (typeof search.category === "string" && ID.test(search.category)) out.category = search.category
  const sort = readOneOf(search.sort, EVENT_SORT_COLUMNS)
  if (sort) out.sort = sort
  const direction = readDirection(search.direction)
  if (direction) out.direction = direction
  const days = readEventViewRange(search.days)
  if (days !== undefined && days !== "all") out.days = days
  const who = readOneOf(search.who, SIGN_UP_FILTERS)
  if (who && who !== "coming") out.who = who
  const spots = readOneOf(search.spots, FEATURED_FILTERS)
  if (spots && spots !== "running") out.spots = spots
  const page = readPage(search.page)
  if (page) out.page = page
  if (readOneOf(String(search.size), DASHBOARD_ROWS_PER_PAGE_OPTIONS.map(String))) out.size = Number(search.size)
  return out
}

export function eventsSectionOf(search: EventsSearch): EventsSection {
  return search.section ?? "events"
}

/** The address for a row picked in the Dashboards block: a fresh start in that row. */
export function eventsSectionSearch(section: EventsSection, keep: Partial<EventsSearch> = {}): EventsSearch {
  return { ...(section === "events" ? {} : { section }), ...keep }
}
