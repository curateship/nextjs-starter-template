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
  EVENT_VIEWS,
  eventDateWindow,
  readEventDateFilter,
  readEventNear,
  type EventDateSearch,
  type EventNearSearch,
  type EventsPageSearch,
} from "@/lib/events/events-page"
import { parseDirectoryNearPoint } from "@/lib/directory/public-search"
import {
  eventHasEnded,
  eventWhenLines,
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
  readEventsBetween,
  readPublicEvent,
  readUpcomingEvents,
  type EventCategory,
  type PublicEventCard,
  type PublicEventPage,
} from "@/server/events/public"

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
      }
    | {
        view: "month"
        month: YearMonth
        /** Every event on any day of the grid's weeks, soonest first. */
        events: PublicEventCard[]
      }
  )

const readEventsPageFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      view: z.enum(EVENT_VIEWS).optional(),
      month: z.string().max(7).optional(),
      day: z.string().max(10).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      place: z.string().max(160).optional(),
      category: z.string().max(160).optional(),
      when: z.enum(EVENT_DATE_FILTERS).optional(),
      from: z.string().max(10).optional(),
      to: z.string().max(10).optional(),
      near: z.string().max(40).optional(),
      radius: z.number().int().optional(),
      area: z.string().max(120).optional(),
    })
  )
  .handler(async ({ data }): Promise<EventsPageData | null> => {
    const open = await siteWithOpenEvents()
    if (!open) return null
    const { site } = open

    const [timeZone, categories] = await Promise.all([
      siteTimeZone(site.id),
      readEventCategories(site.id),
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
      categories,
      category,
    }

    if (data.view === "month") {
      const month = parseYearMonth(data.month) ?? parseYearMonth(common.today)!
      const cells = monthMatrix(month)
      const events = await readEventsBetween(
        site,
        cells[0]!.date,
        cells[cells.length - 1]!.date,
        undefined,
        onlyCategory
      )
      return { ...common, view: "month", month, events }
    }

    const mark = (events: PublicEventCard[]): ListedEvent[] =>
      events.map((event) => ({
        ...event,
        ended: eventHasEnded(event, timeZone, at),
      }))

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
    const nearby = readEventNear(data)
    const point = parseDirectoryNearPoint(nearby.near)
    const upcoming = await readUpcomingEvents(site, page, now, undefined, {
      ...onlyCategory,
      ...(place ? { placeId: place.id } : {}),
      ...eventDateWindow(dates, common.today),
      ...(point ? { near: point, radius: nearby.radius } : {}),
    })
    return {
      ...common,
      view: "list",
      day: null,
      place: place
        ? {
            title: place.title,
            slug: place.slug,
            linked: directoryVisibility === "everyone",
          }
        : null,
      dates,
      nearby,
      events: mark(upcoming.events),
      total: upcoming.total,
      page,
      pageSize: upcoming.pageSize,
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
}

const readEventFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().min(1).max(160) }))
  .handler(async ({ data }): Promise<PublicEventView | null> => {
    const open = await siteWithOpenEvents()
    if (!open) return null

    const page = await readPublicEvent(open.site, data.slug)
    if (!page) return null
    // Worked out on every request, after the cache, by the site's clock.
    return {
      ...page,
      ended: eventHasEnded(page.event, page.timeZone, new Date()),
      when: eventWhenLines(page.event, page.timeZone),
      mapKey: page.event.position
        ? await directoryMapDisplayKey(open.site.id)
        : null,
    }
  })

/** One published event by its address, or null if there is not one. */
export function loadEvent(slug: string) {
  return readEventFn({ data: { slug } })
}

export type { EventCategory, PublicEventCard } from "@/server/events/public"
