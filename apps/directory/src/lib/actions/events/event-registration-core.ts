// Pure helpers for event RSVPs / ticket registration: reading the registration
// settings out of an event's content blocks, seat counting, and the wall-clock
// timing rules. Kept free of 'server-only' and of any DB import so both the
// server actions and the unit tests (event-registration-core.test.ts) can use it.
//
// Events carry a floating wall-clock date/time with no timezone (see
// src/lib/utils/calendar.ts). Everything here follows that model: an event's
// start is interpreted in the reader's own zone, exactly as the event page
// prints it and as the .ics file schedules it.

import { findEventContentBlockKey } from '@/lib/utils/calendar'

const EVENT_REGISTRATION_MODES = ['none', 'free', 'paid'] as const
export type EventRegistrationMode = (typeof EVENT_REGISTRATION_MODES)[number]

/**
 * How long a paid checkout holds its seat. The registration row is written as
 * 'pending' when the Stripe session is created; if payment never completes, the
 * row stops counting against capacity after this window so the seat is not lost.
 */
export const REGISTRATION_HOLD_MINUTES = 30

/** How long before the start time the reminder email goes out. */
export const REMINDER_LEAD_HOURS = 24

const MINUTE_MS = 60 * 1000
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Stripe price ids are `price_` plus an opaque alphanumeric id.
const STRIPE_PRICE_ID_REGEX = /^price_[A-Za-z0-9_]+$/

export interface EventRegistrationSettings {
  mode: EventRegistrationMode
  /** Maximum live registrations, or null for unlimited. */
  capacity: number | null
  /** Stripe Price id that is actually charged. Empty unless mode is 'paid'. */
  ticketPriceId: string
  /** Display-only price text shown on the button (Stripe owns the real amount). */
  ticketPriceLabel: string
}

const NO_REGISTRATION: EventRegistrationSettings = {
  mode: 'none',
  capacity: null,
  ticketPriceId: '',
  ticketPriceLabel: '',
}

function isRegistrationMode(value: unknown): value is EventRegistrationMode {
  return typeof value === 'string' && (EVENT_REGISTRATION_MODES as readonly string[]).includes(value)
}

/** Positive whole seat count, or null (unlimited) for anything else. */
export function normalizeCapacity(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return null
  const capacity = Math.floor(parsed)
  return capacity > 0 ? capacity : null
}

export function normalizeTicketPriceId(value: unknown): string {
  const priceId = typeof value === 'string' ? value.trim() : ''
  return STRIPE_PRICE_ID_REGEX.test(priceId) ? priceId : ''
}

/**
 * The event's registration settings, read from its event-content block (the same
 * place the date, time and venue live).
 *
 * A 'paid' event with no usable Stripe price cannot charge anyone, so it reports
 * 'none' rather than showing a buy button that would fail at checkout.
 */
export function readEventRegistrationSettings(contentBlocks: unknown): EventRegistrationSettings {
  if (!contentBlocks || typeof contentBlocks !== 'object') return NO_REGISTRATION

  const key = findEventContentBlockKey(contentBlocks)
  if (!key) return NO_REGISTRATION

  const block = (contentBlocks as Record<string, unknown>)[key]
  const content = (block && typeof block === 'object' ? (block as { content?: unknown }).content : null)
  if (!content || typeof content !== 'object') return NO_REGISTRATION

  const values = content as Record<string, unknown>
  const mode = isRegistrationMode(values.registrationMode) ? values.registrationMode : 'none'
  if (mode === 'none') return NO_REGISTRATION

  const ticketPriceId = normalizeTicketPriceId(values.ticketPriceId)
  if (mode === 'paid' && !ticketPriceId) return NO_REGISTRATION

  return {
    mode,
    capacity: normalizeCapacity(values.capacity),
    ticketPriceId: mode === 'paid' ? ticketPriceId : '',
    ticketPriceLabel: mode === 'paid' && typeof values.ticketPriceLabel === 'string'
      ? values.ticketPriceLabel.trim().slice(0, 40)
      : '',
  }
}

/**
 * Whether a 'pending' (paid, unfinished checkout) row still holds its seat.
 * Confirmed rows always count; this is only about the hold window.
 */
export function holdIsActive(createdAt: Date | string, now: Date): boolean {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt)
  if (Number.isNaN(created.getTime())) return false
  return now.getTime() - created.getTime() < REGISTRATION_HOLD_MINUTES * MINUTE_MS
}

/** Seats still available, or null when the event has no capacity limit. */
export function seatsRemaining(capacity: number | null, taken: number): number | null {
  if (capacity === null) return null
  return Math.max(0, capacity - taken)
}

export function isSoldOut(capacity: number | null, taken: number): boolean {
  return capacity !== null && taken >= capacity
}

/**
 * The event's start as a local-time timestamp, or null when it has no valid date.
 *
 * With no time set the event is all-day, so its "start" for open/closed purposes
 * is the end of that day — an all-day event stays open to sign up for all day.
 */
export function eventStartTimestamp(eventDate?: string | null, eventTime?: string | null): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate || '')
  if (!dateMatch) return null

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(eventTime || '')
  if (!timeMatch) return new Date(year, month - 1, day, 23, 59).getTime()

  return new Date(year, month - 1, day, Number(timeMatch[1]), Number(timeMatch[2])).getTime()
}

/**
 * True once the event has started.
 *
 * An event with no usable date has not started — nothing can be said about a
 * date that was never set, and claiming it is over would both close signups and
 * tell visitors something untrue. Sign-ups stay open; the confirmation email
 * prints "Date to be announced", and the reminder cron only ever considers
 * events that do have a date.
 */
export function isEventPast(eventDate: string | null | undefined, eventTime: string | null | undefined, now: Date): boolean {
  const startMs = eventStartTimestamp(eventDate, eventTime)
  if (startMs === null) return false
  return startMs <= now.getTime()
}

/** True when the event starts inside the reminder window and has not started yet. */
export function isReminderDue(startMs: number, now: Date): boolean {
  const diffMs = startMs - now.getTime()
  return diffMs > 0 && diffMs <= REMINDER_LEAD_HOURS * 60 * MINUTE_MS
}

/**
 * Strip tags, quotes and control characters, then clamp. Registrants are
 * untrusted input, and the name is interpolated into an email subject and body
 * as well as shown in the admin table.
 */
export function sanitizeRegistrantName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<[^>]*>?/gm, '')
    .replace(/[<>"]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .replace(/\s{2,}/g, ' ')
    .slice(0, 255)
}

export function sanitizeRegistrantEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 255) : ''
  return EMAIL_REGEX.test(email) ? email : ''
}
