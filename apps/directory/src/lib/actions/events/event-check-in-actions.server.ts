// Checking attendees in at the door.
//
// Three ways in, all landing on the same guarded update: the organizer scans a
// ticket QR (which opens the ticket page), types the code into the door screen,
// or finds the person by name. Every one of them requires an admin session —
// the ticket code alone lets you see a ticket, never mark it used.

import { and, asc, eq, isNull, ne, sql, type SQL } from 'drizzle-orm'

import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { eventRegistrations, events } from '@/lib/db/schema'
import { extractEventContentFields } from '@/lib/utils/calendar'
import { UUID_REGEX } from '@/lib/utils/validation'
import { readEventRegistrationSettings } from './event-registration-core'
import type { EventRegistrationStatus } from './event-registration-actions.server'
import { extractCheckInCode } from './event-check-in-core'

const ATTENDEE_LIST_LIMIT = 1000

/** One event on the door screen's event picker. */
export interface EventCheckInEventSummary {
  id: string
  title: string
  event_date: string | null
  event_time: string | null
  registered_count: number
  checked_in_count: number
}

/** One confirmed attendee on the door screen's list. */
export interface EventCheckInAttendee {
  id: string
  name: string
  email: string
  checked_in_at: string | null
}

export type EventCheckInOutcome =
  /** Marked as arrived just now. */
  | 'checked-in'
  /** A valid ticket that was already used — the door screen warns instead of counting it twice. */
  | 'already-checked-in'
  /** No ticket has this code. */
  | 'not-found'
  /** A real ticket, but for a different event than the one on the door screen. */
  | 'wrong-event'
  /** Removed by the owner, or a ticket whose payment never completed. */
  | 'not-registered'

export interface EventCheckInResult {
  outcome: EventCheckInOutcome
  /** The row this outcome is about, so the door screen can update it in place. Empty on 'not-found'. */
  registration_id: string
  attendee_name: string
  event_title: string
  /** When this ticket was used. Set for both 'checked-in' and 'already-checked-in'. */
  checked_in_at: string | null
  /** Plain-English reason a 'not-registered' ticket was refused. */
  reason: string
}

const NOT_FOUND: EventCheckInResult = {
  outcome: 'not-found',
  registration_id: '',
  attendee_name: '',
  event_title: '',
  checked_in_at: null,
  reason: '',
}

function isoOrNull(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

/**
 * Today as the same floating YYYY-MM-DD an event carries, read off the server's
 * own clock — the model the rest of events uses (see event-registration-core).
 */
function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Door order: the next event first, because that is the door the organizer is
 * standing at. Events that have been and gone follow, most recent first, and an
 * event with no date at all sits at the very bottom.
 */
function byDoorOrder(today: string) {
  return (left: EventCheckInEventSummary, right: EventCheckInEventSummary) => {
    const leftUpcoming = (left.event_date || '') >= today
    const rightUpcoming = (right.event_date || '') >= today
    if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1
    return leftUpcoming
      ? (left.event_date || '').localeCompare(right.event_date || '')
      : (right.event_date || '').localeCompare(left.event_date || '')
  }
}

/** Every check-in path is organizer-only. */
async function requireOrganizer() {
  const user = await getAuthenticatedUser()
  if (!user) return 'Authentication required'
  if (user.role !== 'super_admin') return 'Access denied'
  return null
}

/**
 * Admin: everything the door screen shows — the events worth standing at a door
 * for, and (once one is chosen) its confirmed attendees.
 *
 * Registrations still awaiting payment are deliberately absent: they are not
 * registered, and listing them at the door only raises the question of whether
 * to admit someone who has not paid. Scanning such a ticket says so explicitly.
 */
export async function getEventCheckInBoardActionImpl(input: {
  siteId: string
  eventId?: string
}): Promise<{
  events: EventCheckInEventSummary[]
  attendees: EventCheckInAttendee[]
  /** True when the attendee list hit ATTENDEE_LIST_LIMIT, so the screen can say so. */
  truncated: boolean
  error: string | null
}> {
  const empty = { events: [], attendees: [], truncated: false }
  if (!UUID_REGEX.test(input.siteId)) return { ...empty, error: 'Invalid site ID' }
  if (input.eventId && !UUID_REGEX.test(input.eventId)) return { ...empty, error: 'Invalid event ID' }

  const denied = await requireOrganizer()
  if (denied) return { ...empty, error: denied }

  try {
    const [summaryRows, attendeeRows] = await Promise.all([
      db
        .select({
          id: events.id,
          title: events.title,
          contentBlocks: events.contentBlocks,
          registeredCount: sql<number>`count(${eventRegistrations.id}) filter (where ${eventRegistrations.status} = 'confirmed')::int`,
          checkedInCount: sql<number>`count(${eventRegistrations.id}) filter (where ${eventRegistrations.status} = 'confirmed' and ${eventRegistrations.checkedInAt} is not null)::int`,
        })
        .from(events)
        .leftJoin(eventRegistrations, eq(eventRegistrations.eventId, events.id))
        .where(eq(events.siteId, input.siteId))
        .groupBy(events.id),
      input.eventId
        ? db
            .select({
              id: eventRegistrations.id,
              name: eventRegistrations.name,
              email: eventRegistrations.email,
              checkedInAt: eventRegistrations.checkedInAt,
            })
            .from(eventRegistrations)
            .where(and(
              eq(eventRegistrations.siteId, input.siteId),
              eq(eventRegistrations.eventId, input.eventId),
              eq(eventRegistrations.status, 'confirmed'),
            ))
            .orderBy(asc(eventRegistrations.name))
            .limit(ATTENDEE_LIST_LIMIT)
        : Promise.resolve([]),
    ])

    // Only events that take signups, or already have some, can have a door.
    // Both the mode and the date come out of the same content-block JSON, so it
    // is read once per event rather than once per field.
    const summaries: EventCheckInEventSummary[] = summaryRows
      .flatMap((row) => {
        const registered = row.registeredCount ?? 0
        if (readEventRegistrationSettings(row.contentBlocks).mode === 'none' && registered === 0) return []

        const fields = extractEventContentFields(row.contentBlocks)
        return [{
          id: row.id,
          title: row.title,
          event_date: fields.eventDate ?? null,
          event_time: fields.eventTime ?? null,
          registered_count: registered,
          checked_in_count: row.checkedInCount ?? 0,
        }]
      })
      .sort(byDoorOrder(localToday()))

    return {
      events: summaries,
      attendees: attendeeRows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        checked_in_at: isoOrNull(row.checkedInAt),
      })),
      truncated: attendeeRows.length === ATTENDEE_LIST_LIMIT,
      error: null,
    }
  } catch (error) {
    console.error('Failed to load the event check-in board:', error)
    return { ...empty, error: 'Could not load check-in. Please try again.' }
  }
}

/** The registration a ticket code or a row id points at, with its event. */
async function loadRegistration(where: SQL) {
  const [row] = await db
    .select({
      id: eventRegistrations.id,
      eventId: eventRegistrations.eventId,
      status: eventRegistrations.status,
      name: eventRegistrations.name,
      checkedInAt: eventRegistrations.checkedInAt,
      eventTitle: events.title,
    })
    .from(eventRegistrations)
    .innerJoin(events, eq(events.id, eventRegistrations.eventId))
    .where(where)
    .limit(1)

  return row ?? null
}

/**
 * Stamp the arrival, once.
 *
 * The update is guarded on `checked_in_at` still being null, so two organizers
 * scanning the same ticket at the same moment cannot both record an arrival:
 * the second update matches no row and reports the first one's time.
 */
async function markArrived(row: {
  id: string
  status: EventRegistrationStatus
  name: string
  checkedInAt: Date | null
  eventTitle: string
}): Promise<EventCheckInResult> {
  const base = {
    registration_id: row.id,
    attendee_name: row.name,
    event_title: row.eventTitle,
    reason: '',
  }

  if (row.status !== 'confirmed') {
    return {
      ...base,
      outcome: 'not-registered',
      checked_in_at: null,
      reason: row.status === 'pending'
        ? 'This ticket has not been paid for yet.'
        : 'This registration was removed.',
    }
  }

  if (row.checkedInAt) {
    return { ...base, outcome: 'already-checked-in', checked_in_at: row.checkedInAt.toISOString() }
  }

  const now = new Date()
  const [updated] = await db
    .update(eventRegistrations)
    .set({ checkedInAt: now, updatedAt: now })
    .where(and(eq(eventRegistrations.id, row.id), isNull(eventRegistrations.checkedInAt)))
    .returning({ checkedInAt: eventRegistrations.checkedInAt })

  if (!updated) {
    // Someone else got there first, between the read above and this update.
    const [current] = await db
      .select({ checkedInAt: eventRegistrations.checkedInAt })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.id, row.id))
      .limit(1)
    return { ...base, outcome: 'already-checked-in', checked_in_at: isoOrNull(current?.checkedInAt) }
  }

  return { ...base, outcome: 'checked-in', checked_in_at: isoOrNull(updated.checkedInAt) }
}

/**
 * Admin: check someone in from their ticket code.
 *
 * `scanned` is whatever the door screen was handed — the code itself, the code
 * typed with its dashes, or the ticket URL a camera read off the QR.
 * `eventId` is the door the organizer is standing at: a real ticket for another
 * event is refused rather than quietly admitted.
 */
export async function checkInByCodeActionImpl(input: {
  scanned: string
  eventId?: string
}): Promise<EventCheckInResult & { error: string | null }> {
  const denied = await requireOrganizer()
  if (denied) return { ...NOT_FOUND, error: denied }

  if (input.eventId && !UUID_REGEX.test(input.eventId)) {
    return { ...NOT_FOUND, error: 'Invalid event ID' }
  }

  const code = extractCheckInCode(input.scanned)
  if (!code) return { ...NOT_FOUND, error: null }

  try {
    const row = await loadRegistration(eq(eventRegistrations.checkInCode, code))
    if (!row) return { ...NOT_FOUND, error: null }

    if (input.eventId && row.eventId !== input.eventId) {
      return {
        outcome: 'wrong-event',
        registration_id: row.id,
        attendee_name: row.name,
        event_title: row.eventTitle,
        checked_in_at: isoOrNull(row.checkedInAt),
        reason: '',
        error: null,
      }
    }

    return { ...(await markArrived(row)), error: null }
  } catch (error) {
    console.error('Failed to check in by ticket code:', error)
    return { ...NOT_FOUND, error: 'Could not check this ticket in. Please try again.' }
  }
}

/** Admin: check someone in from the door screen's name search. */
export async function checkInAttendeeActionImpl(input: {
  registrationId: string
}): Promise<EventCheckInResult & { error: string | null }> {
  const denied = await requireOrganizer()
  if (denied) return { ...NOT_FOUND, error: denied }
  if (!UUID_REGEX.test(input.registrationId)) return { ...NOT_FOUND, error: 'Invalid registration ID' }

  try {
    const row = await loadRegistration(eq(eventRegistrations.id, input.registrationId))
    if (!row) return { ...NOT_FOUND, error: null }
    return { ...(await markArrived(row)), error: null }
  } catch (error) {
    console.error('Failed to check in an attendee:', error)
    return { ...NOT_FOUND, error: 'Could not check this attendee in. Please try again.' }
  }
}

/**
 * What the ticket page's organizer panel shows.
 *
 * Called by every visitor to a ticket page, so it says nothing an attendee
 * cannot already see on their own ticket: a visitor without an admin session
 * gets `can_check_in: false` and the panel renders nothing.
 */
export async function getTicketCheckInStateActionImpl(input: {
  code: string
}): Promise<{ can_check_in: boolean; checked_in_at: string | null }> {
  const closed = { can_check_in: false, checked_in_at: null }

  const code = extractCheckInCode(input.code)
  if (!code) return closed
  if (await requireOrganizer()) return closed

  try {
    const [row] = await db
      .select({ status: eventRegistrations.status, checkedInAt: eventRegistrations.checkedInAt })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.checkInCode, code))
      .limit(1)

    if (!row || row.status !== 'confirmed') return closed
    return { can_check_in: true, checked_in_at: isoOrNull(row.checkedInAt) }
  } catch (error) {
    console.error('Failed to load ticket check-in state:', error)
    return closed
  }
}

/**
 * Public: the ticket behind a code, for its own page and its QR image.
 *
 * The code is the ticket, so holding it is the authorization — but it buys the
 * holder only their own name, their event and their arrival status. Scoped to
 * the site the request arrived on, so one site's URL never serves another
 * site's ticket. Returns null for a cancelled registration, which no longer
 * admits anyone.
 */
export async function loadTicket(siteId: string, scanned: string) {
  const code = extractCheckInCode(scanned)
  if (!UUID_REGEX.test(siteId) || !code) return null

  const [row] = await db
    .select({
      code: eventRegistrations.checkInCode,
      status: eventRegistrations.status,
      name: eventRegistrations.name,
      checkedInAt: eventRegistrations.checkedInAt,
      eventTitle: events.title,
      eventSlug: events.slug,
      eventContentBlocks: events.contentBlocks,
    })
    .from(eventRegistrations)
    .innerJoin(events, eq(events.id, eventRegistrations.eventId))
    .where(and(
      eq(eventRegistrations.siteId, siteId),
      eq(eventRegistrations.checkInCode, code),
      ne(eventRegistrations.status, 'cancelled'),
    ))
    .limit(1)

  return row ?? null
}
