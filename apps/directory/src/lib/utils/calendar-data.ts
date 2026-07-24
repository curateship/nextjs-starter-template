// Server-side data access for the calendar routes: load published events, turn
// them into CalendarEvents, and build the .ics HTTP response. Kept separate from
// calendar.ts (pure/isomorphic) so DB code never leaks into the frontend bundle.

import { and, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { events } from '@/lib/db/schema/events'
import {
  buildEventLocation,
  extractEventContentFields,
  htmlToPlainText,
  type CalendarEvent,
} from './calendar'

interface EventCalendarRow {
  id: string
  slug: string
  title: string
  metaDescription: string | null
  contentBlocks: unknown
  updatedAt: Date | string | null
}

function hostFromBaseUrl(baseUrl: string) {
  return baseUrl.replace(/^https?:\/\//, '')
}

function toCalendarEvent(row: EventCalendarRow, baseUrl: string): CalendarEvent | null {
  const fields = extractEventContentFields(row.contentBlocks)
  // No usable date means it can't go on a calendar — skip it.
  if (!fields.eventDate) return null

  const metaDescription = row.metaDescription?.trim()
  const description = metaDescription || (fields.body ? htmlToPlainText(fields.body) : '')

  return {
    uid: `${row.id}@${hostFromBaseUrl(baseUrl)}`,
    title: row.title,
    description: description || undefined,
    location: buildEventLocation(fields.venueName, fields.venueAddress) || undefined,
    url: `${baseUrl}/events/${row.slug}`,
    startDate: fields.eventDate,
    startTime: fields.eventTime,
    updatedAt: row.updatedAt,
  }
}

const EVENT_CALENDAR_COLUMNS = {
  id: events.id,
  slug: events.slug,
  title: events.title,
  metaDescription: events.metaDescription,
  contentBlocks: events.contentBlocks,
  updatedAt: events.updatedAt,
}

export async function getEventForCalendar(siteId: string, slug: string, baseUrl: string) {
  const [row] = await db
    .select(EVENT_CALENDAR_COLUMNS)
    .from(events)
    .where(and(eq(events.siteId, siteId), eq(events.slug, slug), eq(events.isPublished, true)))
    .limit(1)

  if (!row) return null
  return toCalendarEvent(row as EventCalendarRow, baseUrl)
}

// Today's wall-clock date as `YYYY-MM-DD`, matching the floating event dates.
function todayDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export async function getUpcomingEventsForCalendarFeed(siteId: string, baseUrl: string): Promise<CalendarEvent[]> {
  const rows = await db
    .select(EVENT_CALENDAR_COLUMNS)
    .from(events)
    .where(and(eq(events.siteId, siteId), eq(events.isPublished, true)))

  const today = todayDateString()

  return rows
    .map((row) => toCalendarEvent(row as EventCalendarRow, baseUrl))
    .filter((event): event is CalendarEvent => event !== null && event.startDate >= today)
    .sort((a, b) => `${a.startDate}${a.startTime ?? ''}`.localeCompare(`${b.startDate}${b.startTime ?? ''}`))
}

export function createIcsResponse(ics: string, options?: { filename?: string }) {
  const headers: Record<string, string> = {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  }
  if (options?.filename) {
    headers['Content-Disposition'] = `attachment; filename="${options.filename}"`
  }
  return new Response(ics, { headers })
}
