import { eventCalendarFile } from "@/lib/events/calendar-file"
import { db, type CustomShellDb } from "@/server/db"
import type { VisitorSite } from "@/server/directory/public"
import {
  eventsAccessFor,
  readCalendarFeed,
  readPublicEvent,
} from "@/server/events/public"

/**
 * The two calendar files a visitor's calendar app reads: one event's file at
 * /events/<address>/calendar.ics, and the whole site's subscription at
 * /events.ics. The file itself is written by `src/lib/events/calendar-file.ts`.
 */

const CALENDAR_CONTENT_TYPE = "text/calendar; charset=utf-8"

function notFound(): Response {
  return new Response("Not found", { status: 404 })
}

/**
 * One published event's file. It follows the event page's own rule, so a
 * member who is signed in can save an event from a members-only site. The
 * answer depends on who asks, so no shared cache may keep it.
 */
export async function eventCalendarFileResponse(input: {
  site: VisitorSite | null
  slug: string
  isSignedIn: () => Promise<boolean>
  now?: Date
  database?: CustomShellDb
}): Promise<Response> {
  const database = input.database ?? db
  const { site } = input
  if (!site) return notFound()
  if (!(await eventsAccessFor(site.id, input.isSignedIn, database))) {
    return notFound()
  }
  const page = await readPublicEvent(site, input.slug, database)
  if (!page) return notFound()

  const { event } = page
  const file = eventCalendarFile(
    [{ ...event, url: `${site.url}/events/${event.slug}` }],
    {
      siteName: site.name,
      timeZone: page.timeZone,
      now: input.now ?? new Date(),
    }
  )
  return new Response(file, {
    headers: {
      "Cache-Control": "private, no-cache",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
      "Content-Type": CALENDAR_CONTENT_TYPE,
    },
  })
}

/**
 * The site's subscription: every published event not over yet. Only while
 * the Events page is open to everyone, because a calendar app is never signed
 * in. A calendar app checks back every few hours, so five minutes of caching
 * costs a subscriber nothing.
 */
export async function siteCalendarFeedResponse(input: {
  site: VisitorSite | null
  now?: Date
  database?: CustomShellDb
}): Promise<Response> {
  const { site } = input
  if (!site) return notFound()
  const now = input.now ?? new Date()
  const feed = await readCalendarFeed(site.id, now, input.database ?? db)
  if (!feed) return notFound()

  const file = eventCalendarFile(
    feed.events.map((event) => ({
      ...event,
      url: `${site.url}/events/${event.slug}`,
    })),
    { siteName: site.name, timeZone: feed.timeZone, now, feed: true }
  )
  return new Response(file, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": CALENDAR_CONTENT_TYPE,
    },
  })
}
