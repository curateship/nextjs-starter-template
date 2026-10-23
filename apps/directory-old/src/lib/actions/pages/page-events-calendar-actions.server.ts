import { and, eq } from "drizzle-orm"

import { unstable_cache } from "@/lib/cache"
import { db } from "@/lib/db"
import { events } from "@/lib/db/schema/events"
import { extractEventContentFields } from "@/lib/utils/calendar"
import { isValidDateString } from "@/lib/utils/calendar-grid"
import { UUID_REGEX } from "@/lib/utils/validation"

export interface EventsCalendarEntry {
  id: string
  slug: string
  title: string
  /** Wall-clock start date, `YYYY-MM-DD`. */
  date: string
  /** Wall-clock start time, `HH:MM`. Absent => all-day. */
  time?: string
  featuredImage: string | null
}

export interface EventsCalendarData {
  events: EventsCalendarEntry[]
}

// A directory site will never have this many events; the cap only bounds the
// query so one runaway site can't load an unbounded set into every page render.
const EVENTS_CALENDAR_MAX = 500

const getCachedEventsCalendarData = unstable_cache(
  async (siteId: string): Promise<EventsCalendarData> => {
    const rows = await db
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        contentBlocks: events.contentBlocks,
        featuredImage: events.featuredImage,
      })
      .from(events)
      .where(and(eq(events.siteId, siteId), eq(events.isPublished, true)))
      .limit(EVENTS_CALENDAR_MAX)

    const entries = rows.flatMap((row): EventsCalendarEntry[] => {
      const fields = extractEventContentFields(row.contentBlocks)
      // No usable date means it can't sit on a calendar — drop it.
      if (!isValidDateString(fields.eventDate)) return []

      return [{
        id: row.id,
        slug: row.slug,
        title: row.title,
        date: fields.eventDate,
        time: fields.eventTime,
        featuredImage: row.featuredImage,
      }]
    })

    // Chronological: date first, then time (all-day events sort before timed
    // ones on the same day because "" < "HH:MM").
    entries.sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`))

    return { events: entries }
  },
  ["events-calendar-data-v1"],
  {
    revalidate: 3600,
    // Every event create/update/delete calls revalidateTag('events'), so this
    // cache clears whenever a site's events change.
    tags: ["events", "all"],
  }
)

export async function getEventsCalendarDataImpl(params: { siteId: string }): Promise<{
  success: boolean
  data?: EventsCalendarData
  error?: string
}> {
  try {
    const { siteId } = params
    if (!siteId || !UUID_REGEX.test(siteId)) {
      return { success: false, error: "Site ID is required" }
    }

    const data = await getCachedEventsCalendarData(siteId)
    return { success: true, data }
  } catch (error) {
    console.error("Error loading events calendar data:", error)
    return { success: false, error: "Failed to load events" }
  }
}
