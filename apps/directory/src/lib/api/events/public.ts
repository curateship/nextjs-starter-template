import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  isValidDateString,
  monthMatrix,
  parseYearMonth,
  type YearMonth,
} from "@/lib/events/calendar-grid"
import {
  EVENT_DATE_FILTERS,
  EVENT_LISTS,
  EVENT_VIEWS,
  eventDateWindow,
  readEventDateFilter,
  readEventNear,
  type EventDateFilter,
  type EventDateSearch,
  type EventNearSearch,
  type EventsPageSearch,
} from "@/lib/events/events-page"
import { parseDirectoryNearPoint } from "@/lib/directory/public-search"
import { readSearchText } from "@/lib/nav/list-search"
import {
  eventDaysText,
  eventHasEnded,
  eventRowText,
  eventWhenLines,
  formatEventClock,
  timeZoneLabel,
  wallClockAt,
} from "@/lib/events/event-time"
import { findCurrentUser } from "@/server/auth/security"
import { readPageVisibility } from "@/server/content/pages"
import {
  visitorSite,
  type PublicSite,
  type VisitorSite,
} from "@/server/directory/public"
import {
  directoryMapDisplayKey,
  siteTimeZone,
} from "@/server/directory/settings"
import {
  eventsAccessFor,
  findEventPlace,
  readEventCategories,
  readEventDateCounts,
  readEventNeighbours,
  readEventPins,
  readEventsBetween,
  readPublicEvent,
  readUpcomingEvents,
  type EventCategory,
  type EventNeighbour,
  type PublicEventCard,
  type PublicEventPage,
} from "@/server/events/public"
import { signUpBoxFor, type SignUpBox } from "@/server/events/sign-ups"

/**
 * The public events pages' two doors. Neither carries a guard, because a
 * public page that needs a session is not a public page; both are written down
 * in `src/app/open-endpoints.ts` with the reason.
 *
 * Each checks the Events page's own switch before reading anything. The route
 * checks it too, but the route only decides what a browser draws, and anyone
 * can call these directly. A switched-off Events page, or a members-only one
 * asked for by somebody signed out, answers null, the same as a page that does
 * not exist.
 *
 * "Now" and "today" are the site's own clock, worked out here on every
 * request, after the cache, and handed to the page. The browser's clock is
 * never asked.
 */

async function siteWithOpenEvents(): Promise<{
  site: VisitorSite
  access: "everyone" | "members"
} | null> {
  const site = await visitorSite()
  if (!site) return null
  const access = await eventsAccessFor(site.id, async () =>
    Boolean(await findCurrentUser().catch(() => null))
  )
  return access ? { site, access } : null
}

/**
 * The number of events behind each date chip, "Any time" included, and
 * behind the Past chip.
 */
export type EventDateCounts = { anyTime: number; past: number } & Record<
  EventDateFilter,
  number
>

/** One upcoming event as a pin, with its "when" written by the server. */
export type EventPin = {
  id: string
  title: string
  slug: string
  latitude: number
  longitude: number
  placeName: string
  /** "Sat, Sep 26 · 6:00 PM to 11:00 PM". */
  when: string
}

/** An event in a list, marked when it is already over. */
export type ListedEvent = PublicEventCard & { ended: boolean }

type EventsPageCommon = {
  site: PublicSite
  /** "Eastern Time": the zone every time on the page is in. */
  zone: string
  /** "2026-09-23", the site's today. */
  today: string
  /**
   * The site's calendar subscription address, like
   * https://site.test/events.ics. Null unless the Events page is open to
   * everyone, because a calendar app asking for it is never signed in.
   */
  calendarFeedUrl: string | null
  /**
   * Whether the "Suggest an event" button shows: only while the Suggest an
   * event page is open to this visitor, so it never leads to a closed page.
   */
  canSuggest: boolean
  /** Every category the filter offers, in the admin's order. */
  categories: EventCategory[]
  /**
   * The category the page is narrowed to. Null when the address names none,
   * or names one with no listed events here, and then every event shows.
   */
  category: EventCategory | null
}

export type EventsPageData = EventsPageCommon &
  (
    | {
        view: "list"
        /** The events that are over, newest first, instead of the ones to come. */
        past: boolean
        /** Set when the list is narrowed to one day, which is never paged. */
        day: string | null
        /**
         * Set when the list is narrowed to the events at one listing.
         * `linked` is false while the directory is switched off or kept for
         * members, the same rule as a place on an event page.
         */
        place: { title: string; slug: string; linked: boolean } | null
        /** The date filter as read, empty when there is none. */
        dates: EventDateSearch
        /**
         * The distance filter as read, empty when there is none. Events with
         * no position on a map are left out while it is set.
         */
        nearby: EventNearSearch
        events: ListedEvent[]
        total: number
        page: number
        pageSize: number
        /**
         * The number beside each date chip: how many events that chip would
         * show with the rest of the filters left alone. Null on one day's
         * list, which has no date chips.
         */
        dateCounts: EventDateCounts | null
      }
    | {
        view: "month"
        month: YearMonth
        /** Every event on any day of the grid's weeks, soonest first. */
        events: PublicEventCard[]
      }
    | {
        view: "map"
        place: { title: string; slug: string; linked: boolean } | null
        dates: EventDateSearch
        nearby: EventNearSearch
        /** The list's events with a place on the map, soonest first, capped. */
        pins: EventPin[]
        /** How many of the list's events have a place on the map. */
        total: number
        /** How many match but have no place on the map. */
        unplaced: number
        /** The site's Google Maps browser key, or null when it has none. */
        mapKey: string | null
        dateCounts: EventDateCounts
      }
  )

const readEventsPageFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      view: z.enum(EVENT_VIEWS).optional(),
      list: z.enum(EVENT_LISTS).optional(),
      month: z.string().max(7).optional(),
      day: z.string().max(10).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      place: z.string().max(160).optional(),
      category: z.string().max(160).optional(),
      when: z.enum(EVENT_DATE_FILTERS).optional(),
      from: z.string().max(10).optional(),
      to: z.string().max(10).optional(),
      q: z.string().max(120).optional(),
      near: z.string().max(40).optional(),
      radius: z.number().int().optional(),
      area: z.string().max(120).optional(),
    })
  )
  .handler(async ({ data }): Promise<EventsPageData | null> => {
    const open = await siteWithOpenEvents()
    if (!open) return null
    const { site } = open

    const [timeZone, categories, suggestVisibility] = await Promise.all([
      siteTimeZone(site.id),
      readEventCategories(site.id),
      readPageVisibility(site.id, "/add-event"),
    ])
    const at = new Date()
    const now = wallClockAt(timeZone, at)
    // An address that names no category offered here shows every event.
    const category =
      categories.find((row) => row.slug === data.category) ?? null
    const onlyCategory = category ? { categoryId: category.id } : {}
    const common: EventsPageCommon = {
      site: { name: site.name, url: site.url },
      zone: timeZoneLabel(timeZone),
      today: now.slice(0, 10),
      calendarFeedUrl:
        open.access === "everyone" ? `${site.url}/events.ics` : null,
      canSuggest:
        suggestVisibility === "everyone" ||
        (suggestVisibility === "members" &&
          Boolean(await findCurrentUser().catch(() => null))),
      categories,
      category,
    }

    // A featured spot ends when the event does, so an event that is over
    // loses its mark. Worked out here, after the cache, like "Ended".
    const mark = (events: PublicEventCard[]): ListedEvent[] =>
      events.map((event) => {
        const ended = eventHasEnded(event, timeZone, at)
        return { ...event, ended, featured: Boolean(event.featured) && !ended }
      })

    if (data.view === "month") {
      const month = parseYearMonth(data.month) ?? parseYearMonth(common.today)!
      const cells = monthMatrix(month)
      const events = mark(
        await readEventsBetween(
          site,
          cells[0]!.date,
          cells[cells.length - 1]!.date,
          undefined,
          onlyCategory
        )
      )
      return { ...common, view: "month", month, events }
    }

    if (isValidDateString(data.day)) {
      const events = mark(
        await readEventsBetween(
          site,
          data.day,
          data.day,
          undefined,
          onlyCategory
        )
      )
      return {
        ...common,
        view: "list",
        day: data.day,
        place: null,
        dates: {},
        nearby: {},
        events,
        total: events.length,
        page: 1,
        pageSize: Math.max(events.length, 1),
        dateCounts: null,
        past: false,
      }
    }

    const page = data.page ?? 1
    // An address that is not a published listing here shows every event.
    const [place, directoryVisibility] = data.place
      ? await Promise.all([
          findEventPlace(site.id, data.place),
          readPageVisibility(site.id, "/directory"),
        ])
      : [null, null]
    // Read again with the route's rule, because anyone can call this endpoint
    // with any text.
    const dates = readEventDateFilter(data)
    const typed = readSearchText(data.q)
    const nearby = readEventNear(data)
    const point = parseDirectoryNearPoint(nearby.near)
    // What every chip and the list share: the place, the category, the typed
    // words and the distance. The dates are the one thing the chips change,
    // so they are the one thing the counts leave out.
    const narrowed = {
      ...onlyCategory,
      ...(place ? { placeId: place.id } : {}),
      ...(point ? { near: point, radius: nearby.radius } : {}),
      ...(typed ? { q: typed } : {}),
    }
    const past = data.view !== "map" && data.list === "past"
    const placeFound = place
      ? {
          title: place.title,
          slug: place.slug,
          linked: directoryVisibility === "everyone",
        }
      : null
    const readCounts = async () => {
      const counts = await readEventDateCounts(
        site,
        now,
        EVENT_DATE_FILTERS.map(
          (when) => eventDateWindow({ when }, common.today) ?? {}
        ),
        undefined,
        narrowed
      )
      return {
        anyTime: counts.anyTime,
        past: counts.past,
        ...(Object.fromEntries(
          EVENT_DATE_FILTERS.map((when, index) => [
            when,
            counts.windows[index] ?? 0,
          ])
        ) as Record<EventDateFilter, number>),
      }
    }

    if (data.view === "map") {
      const [found, dateCounts, mapKey] = await Promise.all([
        readEventPins(site, now, undefined, {
          ...narrowed,
          ...eventDateWindow(dates, common.today),
        }),
        readCounts(),
        directoryMapDisplayKey(site.id),
      ])
      return {
        ...common,
        view: "map",
        place: placeFound,
        dates,
        nearby,
        pins: found.pins.map((pin) => ({
          id: pin.id,
          title: pin.title,
          slug: pin.slug,
          latitude: pin.latitude,
          longitude: pin.longitude,
          placeName: pin.placeName,
          when: eventRowText(pin),
        })),
        total: found.total,
        unplaced: found.unplaced,
        mapKey,
        dateCounts,
      }
    }

    // The Past list keeps the place, the category and the typed words. The
    // dates and the distance belong to the upcoming list.
    const pastNarrowed = {
      ...onlyCategory,
      ...(place ? { placeId: place.id } : {}),
      ...(typed ? { q: typed } : {}),
    }
    const [listed, dateCounts] = await Promise.all([
      past
        ? readUpcomingEvents(site, page, now, undefined, {
            past: true,
            ...pastNarrowed,
          })
        : readUpcomingEvents(site, page, now, undefined, {
            featured: true,
            ...narrowed,
            ...eventDateWindow(dates, common.today),
          }),
      readCounts(),
    ])
    return {
      ...common,
      view: "list",
      past,
      day: null,
      place: placeFound,
      dates: past ? {} : dates,
      nearby: past ? {} : nearby,
      events: mark(listed.events),
      total: listed.total,
      page,
      pageSize: listed.pageSize,
      dateCounts,
    }
  })

/** One view of the visited site's Events page, or null if it is closed. */
export function loadEventsPage(input: EventsPageSearch) {
  return readEventsPageFn({ data: input })
}

type PublicEventView = PublicEventPage & {
  ended: boolean
  /**
   * The page's two "when" lines, written here so the server and the browser
   * never name the time zone in two different ways.
   */
  when: { day: string; times: string }
  /**
   * The site's Google Maps key for drawing the map, the same browser key the
   * directory's map uses. Null when the event has no position or the site has
   * no key, and then the page draws no map.
   */
  mapKey: string | null
  /** The sign-up box, or null when the event takes no sign-ups. */
  signUps: SignUpBox | null
  /** "Also on": the repeat's next dates, this one left out. */
  otherDates: EventNeighbourRow[]
  /** "Also at": the place's next events, when the place is a listing. */
  atPlace: EventNeighbourRow[]
}

/** One row of "Also on" or "Also at", its words written by the server. */
export type EventNeighbourRow = {
  id: string
  title: string
  slug: string
  /** "Fri, Nov 28", or "Fri, Nov 28 to Sun, Nov 30" for several days. */
  day: string
  /** "7:00 PM". */
  time: string
}

const readEventFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().min(1).max(160) }))
  .handler(async ({ data }): Promise<PublicEventView | null> => {
    const open = await siteWithOpenEvents()
    if (!open) return null

    const page = await readPublicEvent(open.site, data.slug)
    if (!page) return null
    // Worked out on every request, after the cache, by the site's clock.
    const at = new Date()
    const [mapKey, signUps, neighbours] = await Promise.all([
      page.event.position ? directoryMapDisplayKey(open.site.id) : null,
      signUpBoxFor(open.site.id, page.event.id, page.timeZone, at),
      readEventNeighbours(
        open.site,
        page.event,
        wallClockAt(page.timeZone, at)
      ),
    ])
    const asRow = (row: EventNeighbour): EventNeighbourRow => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      day: eventDaysText(row),
      time: formatEventClock(row.startTime),
    })
    return {
      ...page,
      ended: eventHasEnded(page.event, page.timeZone, at),
      when: eventWhenLines(page.event, page.timeZone),
      mapKey,
      signUps,
      otherDates: neighbours.dates.map(asRow),
      atPlace: neighbours.atPlace.map(asRow),
    }
  })

/** One published event by its address, or null if there is not one. */
export function loadEvent(slug: string) {
  return readEventFn({ data: { slug } })
}

export type { EventCategory, PublicEventCard } from "@/server/events/public"
export type { SignUpBox } from "@/server/events/sign-ups"
