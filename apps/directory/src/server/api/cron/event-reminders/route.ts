import { NextRequest, NextResponse } from '@/lib/web-response'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { eventRegistrations } from '@/lib/db/schema'
import {
  REMINDER_LEAD_HOURS,
  eventStartTimestamp,
  isReminderDue,
} from '@/lib/actions/events/event-registration-core'
import { createEventRegistrationMailer } from '@/lib/actions/events/event-registration-email'

// Safety valves so one tick never processes an unbounded backlog.
const EVENT_LIMIT = 200
const REGISTRATIONS_PER_EVENT = 500

interface ReminderEventRow extends Record<string, unknown> {
  id: string
  siteId: string
  title: string
  slug: string
  eventDate: string | null
  eventTime: string | null
  venueName: string | null
  venueAddress: string | null
}

/**
 * Events that still owe reminders and are dated around now.
 *
 * The event's date/time and venue live inside its event-content block (the app's
 * event model — see migration 191), so they are pulled out of the JSON here.
 * Dates are compared as ISO text, which sorts correctly and cannot fail on a
 * malformed value the way a date cast would. The window is deliberately wider
 * than the reminder lead time; the exact "is it due" decision is made in JS by
 * isReminderDue, using the same floating wall-clock rule as the event page.
 */
async function loadEventsAwaitingReminders() {
  const result = await db.execute<ReminderEventRow>(sql`
    select
      e.id,
      e.site_id as "siteId",
      e.title,
      e.slug,
      ec.event_date as "eventDate",
      ec.event_time as "eventTime",
      ec.venue_name as "venueName",
      ec.venue_address as "venueAddress"
    from events e
    cross join lateral (
      select
        b.value->'content'->>'eventDate' as event_date,
        b.value->'content'->>'eventTime' as event_time,
        b.value->'content'->>'venueName' as venue_name,
        b.value->'content'->>'venueAddress' as venue_address
      from jsonb_each(
        case when jsonb_typeof(e.content_blocks) = 'object' then e.content_blocks else '{}'::jsonb end
      ) b
      where b.value->>'type' = 'event-content'
      limit 1
    ) ec
    where e.is_published = true
      and ec.event_date is not null
      and ec.event_date >= to_char(current_date - 1, 'YYYY-MM-DD')
      and ec.event_date <= to_char(current_date + 2, 'YYYY-MM-DD')
      and exists (
        select 1
        from event_registrations r
        where r.event_id = e.id
          and r.status = 'confirmed'
          and r.reminder_sent_at is null
      )
    order by ec.event_date asc
    limit ${EVENT_LIMIT}
  `)

  return result.rows
}

/**
 * GET /api/cron/event-reminders
 *
 * Emails everyone registered for an event that starts within
 * REMINDER_LEAD_HOURS. `reminder_sent_at` is stamped only after a successful
 * send, so a site with no mail sender configured simply retries next tick and
 * nobody is emailed twice.
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const candidates = await loadEventsAwaitingReminders()

    if (candidates.length === EVENT_LIMIT) {
      console.warn(`Event reminders: hit the ${EVENT_LIMIT}-event batch limit; the rest run next tick.`)
    }

    let sent = 0
    let eventsProcessed = 0

    for (const event of candidates) {
      const startMs = eventStartTimestamp(event.eventDate, event.eventTime)
      if (startMs === null || !isReminderDue(startMs, now)) continue

      eventsProcessed++

      // Resolved once for the whole attendee list, not per recipient.
      const { mailer, error: mailerError } = await createEventRegistrationMailer({
        templateKey: 'event_reminder',
        siteId: event.siteId,
        event: {
          slug: event.slug,
          title: event.title,
          eventDate: event.eventDate,
          eventTime: event.eventTime,
          venueName: event.venueName,
          venueAddress: event.venueAddress,
        },
      })
      if (!mailer) {
        // Nothing is stamped, so this event's reminders retry next tick.
        console.warn(`Event reminders skipped for "${event.title}": ${mailerError}`)
        continue
      }

      const registrations = await db
        .select({
          id: eventRegistrations.id,
          name: eventRegistrations.name,
          email: eventRegistrations.email,
          checkInCode: eventRegistrations.checkInCode,
        })
        .from(eventRegistrations)
        .where(and(
          eq(eventRegistrations.eventId, event.id),
          eq(eventRegistrations.status, 'confirmed'),
          isNull(eventRegistrations.reminderSentAt),
        ))
        .orderBy(asc(eventRegistrations.createdAt))
        .limit(REGISTRATIONS_PER_EVENT)

      for (const registration of registrations) {
        try {
          const result = await mailer.send(registration.name, registration.email, registration.checkInCode)

          if (!result.sent) continue

          await db
            .update(eventRegistrations)
            .set({ reminderSentAt: new Date(), updatedAt: new Date() })
            .where(eq(eventRegistrations.id, registration.id))
          sent++
        } catch (error) {
          // One bad registration must not abort the batch; it retries next tick.
          console.error('Failed to send event reminder for registration', registration.id, error)
        }
      }
    }

    return NextResponse.json({
      message: `Sent ${sent} event reminders across ${eventsProcessed} events (${REMINDER_LEAD_HOURS}h lead)`,
      sent,
      eventsProcessed,
    })
  } catch (error) {
    console.error('Event reminders cron failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
