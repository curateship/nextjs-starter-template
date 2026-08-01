import { NextRequest, NextResponse } from '@/lib/web-response'
import { and, asc, eq, isNull, ne, or, sql, type SQL } from 'drizzle-orm'

import { db } from '@/lib/db'
import { eventRegistrations } from '@/lib/db/schema'
import {
  eventStartTimestamp,
  isFollowUpDue,
  isReminderDue,
  isReminderSwitchOn,
  normalizeReminderLeadHours,
  reminderStartKey,
} from '@/lib/actions/events/event-registration-core'
import {
  createEventRegistrationMailer,
  type EventRegistrationEmailKey,
  type EventRegistrationMailer,
} from '@/lib/actions/events/event-registration-email'

// Safety valves so one tick never processes an unbounded backlog.
const EVENT_LIMIT = 200
const REGISTRATIONS_PER_EVENT = 500

// How far either side of today the candidate scan looks. Forward covers the
// longest reminder lead time an owner can pick (a week) plus a day of slack;
// backward covers the follow-up window, which closes two days after the event.
const SCAN_DAYS_AHEAD = 8
const SCAN_DAYS_BEHIND = 3

interface ReminderEventRow extends Record<string, unknown> {
  id: string
  siteId: string
  title: string
  slug: string
  eventDate: string | null
  eventTime: string | null
  venueName: string | null
  venueAddress: string | null
  remindersEnabled: string | null
  reminderLeadHours: string | null
  followUpEnabled: string | null
}

/**
 * Published events dated around now that have at least one confirmed attendee.
 *
 * The event's date/time, venue and reminder switches live inside its
 * event-content block (the app's event model — see migration 191), so they are
 * pulled out of the JSON here as text. Dates are compared as ISO text, which
 * sorts correctly and cannot fail on a malformed value the way a date cast
 * would. The window is deliberately wider than any reminder lead time; the exact
 * "is it due" decisions are made in JS below, using the same floating wall-clock
 * rule as the event page.
 */
async function loadEventsAwaitingEmails() {
  const result = await db.execute<ReminderEventRow>(sql`
    select
      e.id,
      e.site_id as "siteId",
      e.title,
      e.slug,
      ec.event_date as "eventDate",
      ec.event_time as "eventTime",
      ec.venue_name as "venueName",
      ec.venue_address as "venueAddress",
      ec.reminders_enabled as "remindersEnabled",
      ec.reminder_lead_hours as "reminderLeadHours",
      ec.follow_up_enabled as "followUpEnabled"
    from events e
    cross join lateral (
      select
        b.value->'content'->>'eventDate' as event_date,
        b.value->'content'->>'eventTime' as event_time,
        b.value->'content'->>'venueName' as venue_name,
        b.value->'content'->>'venueAddress' as venue_address,
        b.value->'content'->>'remindersEnabled' as reminders_enabled,
        b.value->'content'->>'reminderLeadHours' as reminder_lead_hours,
        b.value->'content'->>'followUpEnabled' as follow_up_enabled
      from jsonb_each(
        case when jsonb_typeof(e.content_blocks) = 'object' then e.content_blocks else '{}'::jsonb end
      ) b
      where b.value->>'type' = 'event-content'
      limit 1
    ) ec
    where e.is_published = true
      and ec.event_date is not null
      -- The ::int casts are load-bearing: a bound parameter arrives untyped and
      -- Postgres cannot then tell date + integer from date + interval.
      and ec.event_date >= to_char(current_date - ${SCAN_DAYS_BEHIND}::int, 'YYYY-MM-DD')
      and ec.event_date <= to_char(current_date + ${SCAN_DAYS_AHEAD}::int, 'YYYY-MM-DD')
      and exists (
        select 1
        from event_registrations r
        where r.event_id = e.id
          and r.status = 'confirmed'
      )
    order by ec.event_date asc
    limit ${EVENT_LIMIT}
  `)

  return result.rows
}

/**
 * The confirmed attendees of one event who still need the email being sent.
 *
 * `pending` is the "not sent yet" test for that one email, so every row that
 * comes back is emailed and stamped. Asking per email rather than for everyone
 * who needs either is what lets a big event drain: an attendee who has had this
 * email drops out of the next tick's batch, leaving room under the limit for the
 * ones behind them.
 */
function loadPendingRegistrations(eventId: string, pending: SQL) {
  return db
    .select({
      id: eventRegistrations.id,
      name: eventRegistrations.name,
      email: eventRegistrations.email,
      checkInCode: eventRegistrations.checkInCode,
    })
    .from(eventRegistrations)
    .where(and(
      eq(eventRegistrations.eventId, eventId),
      eq(eventRegistrations.status, 'confirmed'),
      pending,
    ))
    .orderBy(asc(eventRegistrations.createdAt))
    .limit(REGISTRATIONS_PER_EVENT)
}

type PendingRegistration = Awaited<ReturnType<typeof loadPendingRegistrations>>[number]

/**
 * A reminder is owed when none has been sent, or when the one that was sent
 * described a different start time — that is a rescheduled event, and those
 * people are holding the wrong time.
 */
function reminderPending(startKey: string) {
  // `or` is typed as possibly-undefined for the empty-argument case; with two
  // conditions it never is. The cast keeps the caller from having to accept an
  // undefined filter, which would quietly widen the query to every attendee.
  return or(
    isNull(eventRegistrations.reminderSentAt),
    ne(eventRegistrations.reminderSentFor, startKey),
  ) as SQL
}

/**
 * Resolve a site's sender and template once for a whole attendee list, and only
 * when somebody actually needs that email. Nothing is stamped when this fails,
 * so a site with no mail sender configured simply retries next tick.
 */
async function resolveMailer(
  templateKey: EventRegistrationEmailKey,
  event: ReminderEventRow,
): Promise<EventRegistrationMailer | null> {
  const { mailer, error } = await createEventRegistrationMailer({
    templateKey,
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
    // Nothing is stamped, so this event's emails retry next tick.
    console.warn(`Event ${templateKey} skipped for "${event.title}": ${error}`)
    return null
  }

  return mailer
}

/**
 * Email one event's attendee list and stamp each send.
 *
 * `startKey` is the start time a reminder describes, and null for a follow-up —
 * which column gets stamped follows from that.
 *
 * The stamp is written only after the provider says the message went out, so a
 * failure retries next tick rather than being silently dropped, and re-running
 * never emails anyone twice. Sending before stamping is the deliberate order: if
 * the stamp itself fails, this attendee is emailed again next tick, which is a
 * better outcome than stamping first and having a send failure look like a
 * delivered email nobody ever received.
 */
async function sendToAll(
  mailer: EventRegistrationMailer,
  recipients: PendingRegistration[],
  startKey: string | null,
) {
  let sent = 0

  for (const registration of recipients) {
    try {
      const result = await mailer.send(registration.name, registration.email, registration.checkInCode)
      if (!result.sent) continue

      const stamp = new Date()
      await db
        .update(eventRegistrations)
        .set({
          ...(startKey === null
            ? { followUpSentAt: stamp }
            : { reminderSentAt: stamp, reminderSentFor: startKey }),
          updatedAt: stamp,
        })
        .where(eq(eventRegistrations.id, registration.id))
      sent++
    } catch (error) {
      // One bad registration must not abort the batch; it retries next tick.
      console.error('Failed to email event registration', registration.id, error)
    }
  }

  return sent
}

/**
 * GET /api/cron/event-reminders
 *
 * Emails everyone registered for an event twice: a reminder the configured
 * number of hours before it starts, and a thank-you the morning after. Both
 * stamps are written only after a successful send, so re-running this never
 * emails anybody twice and a failed send is retried on the next tick.
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
    const candidates = await loadEventsAwaitingEmails()

    if (candidates.length === EVENT_LIMIT) {
      console.warn(`Event reminders: hit the ${EVENT_LIMIT}-event batch limit; the rest run next tick.`)
    }

    let remindersSent = 0
    let followUpsSent = 0
    let eventsProcessed = 0

    for (const event of candidates) {
      const startMs = eventStartTimestamp(event.eventDate, event.eventTime)
      if (startMs === null) continue

      const leadHours = normalizeReminderLeadHours(event.reminderLeadHours)
      const reminderDue = isReminderSwitchOn(event.remindersEnabled) && isReminderDue(startMs, now, leadHours)
      const followUpDue = isReminderSwitchOn(event.followUpEnabled) && isFollowUpDue(startMs, now)
      if (!reminderDue && !followUpDue) continue

      // The two moments cannot overlap — one is before the start, the other the
      // morning after — so exactly one email is in play per event per tick.
      const startKey = reminderStartKey(event.eventDate, event.eventTime)
      const recipients = await loadPendingRegistrations(
        event.id,
        reminderDue ? reminderPending(startKey) : isNull(eventRegistrations.followUpSentAt),
      )
      if (!recipients.length) continue

      if (recipients.length === REGISTRATIONS_PER_EVENT) {
        // Normally harmless — the rest go next tick. It is worth saying out loud
        // because a short lead time is the one case where "next tick" can land
        // after the event has already started, and those people never hear from us.
        console.warn(
          `Event emails for "${event.title}" hit the ${REGISTRATIONS_PER_EVENT}-attendee batch limit; the rest run next tick.`,
        )
      }

      // Resolved once for the whole attendee list, not per recipient.
      const mailer = await resolveMailer(reminderDue ? 'event_reminder' : 'event_follow_up', event)
      if (!mailer) continue

      eventsProcessed++
      const sent = await sendToAll(mailer, recipients, reminderDue ? startKey : null)
      if (reminderDue) remindersSent += sent
      else followUpsSent += sent
    }

    return NextResponse.json({
      message: `Sent ${remindersSent} reminders and ${followUpsSent} follow-ups across ${eventsProcessed} events`,
      remindersSent,
      followUpsSent,
      eventsProcessed,
    })
  } catch (error) {
    console.error('Event reminders cron failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
