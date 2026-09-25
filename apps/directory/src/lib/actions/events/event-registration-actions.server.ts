import Stripe from 'stripe'
import { and, desc, eq, ne, sql } from 'drizzle-orm'

import { getStripeConfig } from '@/lib/actions/integrations/config-helpers'
import { createHubNotificationForSuperAdmins } from '@/lib/actions/notifications/notification-service'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { eventRegistrations, events, sites } from '@/lib/db/schema'
import { headers } from '@/lib/request-headers'
import { extractEventContentFields } from '@/lib/utils/calendar'
import { isValidEventSlug } from '@/lib/utils/event-slug'
import { getClientIp, isPersistentRateLimited } from '@/lib/utils/rate-limit'
import { getSiteUrl } from '@/lib/utils/site-url-generator'
import { UUID_REGEX } from '@/lib/utils/validation'
import { generateCheckInCode } from './event-check-in-core'
import {
  REGISTRATION_HOLD_MINUTES,
  holdIsActive,
  isEventPast,
  isSoldOut,
  readEventRegistrationSettings,
  sanitizeRegistrantEmail,
  sanitizeRegistrantName,
  seatsRemaining,
  type EventRegistrationMode,
} from './event-registration-core'
import { sendEventRegistrationEmail } from './event-registration-email'
import { buildEventTicketMetadata, confirmEventTicketRegistration } from './event-ticket-activation'

const STRIPE_API_VERSION = '2025-10-29.clover'
const STRIPE_SESSION_ID_REGEX = /^cs_[A-Za-z0-9_]+$/

// A visitor gets a handful of signup attempts per hour per site — enough to fix a
// typo or register a partner, low enough that a script cannot fill an event.
const SIGNUP_RATE_LIMIT = 8
const SIGNUP_RATE_WINDOW_MS = 60 * 60 * 1000
// Confirming a checkout hits Stripe, so it is capped separately (a visitor may
// legitimately reload the success page a few times).
const CONFIRM_RATE_LIMIT = 20
const CONFIRM_RATE_WINDOW_MS = 10 * 60 * 1000

const ADMIN_LIST_LIMIT = 500

// Either the pool client or an open transaction — the seat-count and lookup
// helpers below run in both.
type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export type EventRegistrationStatus = 'pending' | 'confirmed' | 'cancelled'

/** What the public event page needs to render the RSVP / ticket panel. */
export interface EventRegistrationState {
  mode: EventRegistrationMode
  capacity: number | null
  taken: number
  remaining: number | null
  soldOut: boolean
  /** The event has already started, so signups are over. */
  closed: boolean
  priceLabel: string
  /** Paid events only: whether the site can actually take a payment. */
  paymentReady: boolean
  error: string | null
}

export interface EventRegistrationListItem {
  id: string
  event_id: string
  event_title: string
  event_slug: string
  status: EventRegistrationStatus
  name: string
  email: string
  amount_total: number | null
  currency: string | null
  reminder_sent_at: string | null
  follow_up_sent_at: string | null
  checked_in_at: string | null
  created_at: string
}

export interface EventRegistrationEventSummary {
  id: string
  title: string
  slug: string
  event_date: string | null
  event_time: string | null
  mode: EventRegistrationMode
  capacity: number | null
  confirmed_count: number
  pending_count: number
  checked_in_count: number
}

const CLOSED_MESSAGE = 'Registration for this event has closed.'
const FULL_MESSAGE = 'This event is full.'
const ALREADY_TICKETED_MESSAGE = 'That email already has a ticket for this event.'
const UNAVAILABLE_MESSAGE = 'Registration is not open for this event.'
const GENERIC_ERROR = 'Something went wrong. Please try again.'

const NO_STATE: EventRegistrationState = {
  mode: 'none',
  capacity: null,
  taken: 0,
  remaining: null,
  soldOut: false,
  closed: false,
  priceLabel: '',
  paymentReady: false,
  error: null,
}

function isoOrNull(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

/** The published event a public signup targets, or null. */
async function loadPublicEvent(siteId: string, slug: string) {
  const [row] = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      contentBlocks: events.contentBlocks,
      subdomain: sites.subdomain,
      customDomain: sites.customDomain,
    })
    .from(events)
    .innerJoin(sites, eq(sites.id, events.siteId))
    .where(and(eq(events.siteId, siteId), eq(events.slug, slug), eq(events.isPublished, true)))
    .limit(1)

  return row ?? null
}

/**
 * Seats currently taken for an event: every confirmed registration, plus the
 * paid checkouts still inside their hold window. `executor` is the transaction
 * when the count has to be consistent with an insert.
 */
async function countTakenSeats(executor: DbExecutor, eventId: string, now: Date) {
  const holdCutoff = new Date(now.getTime() - REGISTRATION_HOLD_MINUTES * 60 * 1000)
  const [row] = await executor
    .select({
      confirmed: sql<number>`count(*) filter (where ${eventRegistrations.status} = 'confirmed')::int`,
      held: sql<number>`count(*) filter (where ${eventRegistrations.status} = 'pending' and ${eventRegistrations.createdAt} > ${holdCutoff})::int`,
    })
    .from(eventRegistrations)
    .where(eq(eventRegistrations.eventId, eventId))

  return { confirmed: row?.confirmed ?? 0, held: row?.held ?? 0 }
}

/** The live (non-cancelled) registration for this email on this event, if any. */
async function findLiveRegistration(executor: DbExecutor, eventId: string, email: string) {
  const [row] = await executor
    .select({
      id: eventRegistrations.id,
      status: eventRegistrations.status,
      createdAt: eventRegistrations.createdAt,
      stripeSessionId: eventRegistrations.stripeSessionId,
      checkInCode: eventRegistrations.checkInCode,
    })
    .from(eventRegistrations)
    .where(and(
      eq(eventRegistrations.eventId, eventId),
      sql`lower(${eventRegistrations.email}) = ${email}`,
      ne(eventRegistrations.status, 'cancelled'),
    ))
    .limit(1)

  return row ?? null
}

/**
 * Seats held by everyone except this registrant. Their own live hold is excluded
 * so re-running an abandoned checkout does not count them twice.
 */
function seatsTakenByOthers(
  counts: { confirmed: number; held: number },
  existing: { status: EventRegistrationStatus; createdAt: Date } | null,
  now: Date,
) {
  const taken = counts.confirmed + counts.held
  const ownsAHold = existing?.status === 'pending' && holdIsActive(existing.createdAt, now)
  return Math.max(0, ownsAHold ? taken - 1 : taken)
}

async function rateLimitSignup(siteId: string) {
  const clientIp = getClientIp(await headers()) || 'unknown'
  return isPersistentRateLimited(`event-registration:${siteId}:${clientIp}`, SIGNUP_RATE_LIMIT, SIGNUP_RATE_WINDOW_MS)
}

function eventEmailContext(row: { slug: string; title: string; contentBlocks: unknown }) {
  const fields = extractEventContentFields(row.contentBlocks)
  return {
    slug: row.slug,
    title: row.title,
    eventDate: fields.eventDate,
    eventTime: fields.eventTime,
    venueName: fields.venueName,
    venueAddress: fields.venueAddress,
  }
}

/**
 * Public: what the event page shows in its registration panel.
 *
 * Returns counts only — never attendee names or emails.
 */
export async function getEventRegistrationStateActionImpl(input: {
  siteId: string
  eventSlug: string
}): Promise<EventRegistrationState> {
  if (!UUID_REGEX.test(input.siteId) || !isValidEventSlug(input.eventSlug)) return NO_STATE

  try {
    const event = await loadPublicEvent(input.siteId, input.eventSlug)
    if (!event) return NO_STATE

    const settings = readEventRegistrationSettings(event.contentBlocks)
    if (settings.mode === 'none') return NO_STATE

    const now = new Date()
    const fields = extractEventContentFields(event.contentBlocks)
    const counts = await countTakenSeats(db, event.id, now)
    const taken = counts.confirmed + counts.held
    const paymentReady = settings.mode === 'paid' ? Boolean(await getStripeConfig(input.siteId)) : true

    return {
      mode: settings.mode,
      capacity: settings.capacity,
      taken,
      remaining: seatsRemaining(settings.capacity, taken),
      soldOut: isSoldOut(settings.capacity, taken),
      closed: isEventPast(fields.eventDate, fields.eventTime, now),
      priceLabel: settings.ticketPriceLabel,
      paymentReady,
      error: null,
    }
  } catch (error) {
    console.error('Failed to load event registration state:', error)
    return { ...NO_STATE, error: 'Could not load registration for this event.' }
  }
}

/**
 * Public: free RSVP.
 *
 * Capacity is enforced inside a transaction that locks the event row, so two
 * people racing for the last seat cannot both get it.
 */
export async function submitEventRegistrationActionImpl(input: {
  siteId: string
  eventSlug: string
  name: string
  email: string
  honeypot?: string
}): Promise<{ success: boolean; error?: string; message?: string }> {
  if (!UUID_REGEX.test(input.siteId) || !isValidEventSlug(input.eventSlug)) {
    return { success: false, error: UNAVAILABLE_MESSAGE }
  }

  // Honeypot: only bots fill the hidden field. Pretend it worked so the bot
  // learns nothing, and never write or notify.
  if (typeof input.honeypot === 'string' && input.honeypot.trim()) {
    return { success: true, message: "You're registered." }
  }

  const name = sanitizeRegistrantName(input.name)
  const email = sanitizeRegistrantEmail(input.email)
  if (!name) return { success: false, error: 'Enter your name.' }
  if (!email) return { success: false, error: 'Enter a valid email address.' }

  try {
    if (await rateLimitSignup(input.siteId)) {
      return { success: false, error: 'Too many attempts. Please try again later.' }
    }

    const event = await loadPublicEvent(input.siteId, input.eventSlug)
    if (!event) return { success: false, error: UNAVAILABLE_MESSAGE }

    const settings = readEventRegistrationSettings(event.contentBlocks)
    if (settings.mode !== 'free') return { success: false, error: UNAVAILABLE_MESSAGE }

    const now = new Date()
    const fields = extractEventContentFields(event.contentBlocks)
    if (isEventPast(fields.eventDate, fields.eventTime, now)) {
      return { success: false, error: CLOSED_MESSAGE }
    }

    const outcome = await db.transaction(async (tx) => {
      // Serializes concurrent signups for this event so the seat count read below
      // cannot go stale between the check and the insert.
      await tx.select({ id: events.id }).from(events).where(eq(events.id, event.id)).for('update')

      const existing = await findLiveRegistration(tx, event.id, email)
      if (existing?.status === 'confirmed') return { kind: 'already' as const, registrationId: existing.id }

      const counts = await countTakenSeats(tx, event.id, now)
      if (isSoldOut(settings.capacity, seatsTakenByOthers(counts, existing, now))) {
        return { kind: 'full' as const }
      }

      if (existing) {
        await tx
          .update(eventRegistrations)
          .set({ status: 'confirmed', name, updatedAt: now })
          .where(eq(eventRegistrations.id, existing.id))
        return { kind: 'registered' as const, registrationId: existing.id, checkInCode: existing.checkInCode }
      }

      const checkInCode = generateCheckInCode()
      const [inserted] = await tx
        .insert(eventRegistrations)
        .values({
          siteId: input.siteId,
          eventId: event.id,
          status: 'confirmed',
          name,
          email,
          checkInCode,
        })
        .returning({ id: eventRegistrations.id })

      if (!inserted) throw new Error('Registration insert returned no row')
      return { kind: 'registered' as const, registrationId: inserted.id, checkInCode }
    })

    if (outcome.kind === 'full') return { success: false, error: FULL_MESSAGE }
    if (outcome.kind === 'already') {
      return { success: true, message: "You're already on the list for this event." }
    }

    await deliverConfirmation({
      registrationId: outcome.registrationId,
      siteId: input.siteId,
      event: eventEmailContext(event),
      attendeeName: name,
      attendeeEmail: email,
      checkInCode: outcome.checkInCode,
    })

    try {
      await createHubNotificationForSuperAdmins({
        type: 'event_registration',
        siteId: input.siteId,
        sourceId: outcome.registrationId,
        title: 'New event RSVP',
        message: `${email} registered for "${event.title}".`,
        targetHref: '/admin/events/registrations',
        metadata: { registration_id: outcome.registrationId, event_id: event.id },
      })
    } catch (error) {
      console.error('Failed to create event registration notification:', error)
    }

    return { success: true, message: "You're registered. Check your email for the details." }
  } catch (error) {
    console.error('Failed to register for event:', error)
    return { success: false, error: GENERIC_ERROR }
  }
}

/** Send the confirmation email and stamp the row only when it actually went out. */
async function deliverConfirmation(params: {
  registrationId: string
  siteId: string
  event: { slug: string; title: string; eventDate?: string; eventTime?: string; venueName?: string; venueAddress?: string }
  attendeeName: string
  attendeeEmail: string
  checkInCode: string
}) {
  try {
    const result = await sendEventRegistrationEmail({
      templateKey: 'event_registration_confirmation',
      siteId: params.siteId,
      event: params.event,
      attendeeName: params.attendeeName,
      attendeeEmail: params.attendeeEmail,
      checkInCode: params.checkInCode,
    })
    if (!result.sent) return
    const now = new Date()
    await db
      .update(eventRegistrations)
      .set({ confirmationSentAt: now, updatedAt: now })
      .where(eq(eventRegistrations.id, params.registrationId))
  } catch (error) {
    // The registration stands even when the email fails.
    console.error('Failed to send event registration confirmation:', error)
  }
}

/**
 * Retire the Stripe session a seat was previously holding, so only one payable
 * session exists per seat at a time. Without this, someone who starts checkout
 * twice (two tabs, or a back-button retry) has two live sessions for one ticket
 * and can be charged twice while only one registration can ever be confirmed.
 *
 * Returns 'paid' when that earlier session had in fact already been paid — the
 * caller must then not sell a second ticket. The registration is confirmed here
 * so the buyer ends up with the ticket they paid for.
 */
async function retirePreviousTicketSession(
  stripe: Stripe,
  siteId: string,
  sessionId: string,
): Promise<'paid' | 'retired'> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.payment_status === 'paid') {
      await confirmEventTicketRegistration({
        siteId,
        metadata: session.metadata ?? null,
        paymentStatus: session.payment_status,
        stripeSessionId: session.id,
        stripePaymentIntentId: typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
        amountTotal: session.amount_total,
        currency: session.currency,
      })
      return 'paid'
    }

    if (session.status === 'open') await stripe.checkout.sessions.expire(sessionId)
  } catch (error) {
    // An already-expired or unreachable session is nothing to act on; the worst
    // case is the old session stays payable, which is the behaviour we had before.
    console.error('Failed to retire the previous event ticket session:', error)
  }

  return 'retired'
}

/**
 * Public: start a paid ticket checkout.
 *
 * Holds the seat first (a 'pending' registration), then creates the Stripe
 * Checkout session pointing at that row. The hold is what makes "sold out"
 * truthful while someone is on the Stripe page; it lapses after
 * REGISTRATION_HOLD_MINUTES so an abandoned checkout returns the seat.
 */
export async function createEventTicketCheckoutActionImpl(input: {
  siteId: string
  eventSlug: string
  name: string
  email: string
  honeypot?: string
}): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!UUID_REGEX.test(input.siteId) || !isValidEventSlug(input.eventSlug)) {
    return { success: false, error: UNAVAILABLE_MESSAGE }
  }
  if (typeof input.honeypot === 'string' && input.honeypot.trim()) {
    return { success: false, error: UNAVAILABLE_MESSAGE }
  }

  const name = sanitizeRegistrantName(input.name)
  const email = sanitizeRegistrantEmail(input.email)
  if (!name) return { success: false, error: 'Enter your name.' }
  if (!email) return { success: false, error: 'Enter a valid email address.' }

  try {
    if (await rateLimitSignup(input.siteId)) {
      return { success: false, error: 'Too many attempts. Please try again later.' }
    }

    const event = await loadPublicEvent(input.siteId, input.eventSlug)
    if (!event) return { success: false, error: UNAVAILABLE_MESSAGE }

    const settings = readEventRegistrationSettings(event.contentBlocks)
    if (settings.mode !== 'paid') return { success: false, error: UNAVAILABLE_MESSAGE }

    const now = new Date()
    const fields = extractEventContentFields(event.contentBlocks)
    if (isEventPast(fields.eventDate, fields.eventTime, now)) {
      return { success: false, error: CLOSED_MESSAGE }
    }

    const stripeConfig = await getStripeConfig(input.siteId)
    if (!stripeConfig) {
      return { success: false, error: 'Ticket sales are not set up for this site yet.' }
    }

    const hold = await db.transaction(async (tx) => {
      await tx.select({ id: events.id }).from(events).where(eq(events.id, event.id)).for('update')

      const existing = await findLiveRegistration(tx, event.id, email)
      if (existing?.status === 'confirmed') return { kind: 'already' as const }

      const counts = await countTakenSeats(tx, event.id, now)
      if (isSoldOut(settings.capacity, seatsTakenByOthers(counts, existing, now))) {
        return { kind: 'full' as const }
      }

      if (existing) {
        // Re-attempt after an abandoned checkout: refresh the hold and drop the
        // old Stripe reference. `previousSessionId` is handed back so the caller
        // can retire that session — two payable sessions for one seat would let
        // the same person be charged twice for a single ticket.
        await tx
          .update(eventRegistrations)
          .set({
            status: 'pending',
            name,
            createdAt: now,
            updatedAt: now,
            stripeSessionId: null,
            stripePaymentIntentId: null,
          })
          .where(eq(eventRegistrations.id, existing.id))
        return {
          kind: 'held' as const,
          registrationId: existing.id,
          previousSessionId: existing.stripeSessionId,
        }
      }

      const [inserted] = await tx
        .insert(eventRegistrations)
        .values({
          siteId: input.siteId,
          eventId: event.id,
          status: 'pending',
          name,
          email,
          checkInCode: generateCheckInCode(),
        })
        .returning({ id: eventRegistrations.id })

      if (!inserted) throw new Error('Ticket hold insert returned no row')
      return { kind: 'held' as const, registrationId: inserted.id, previousSessionId: null }
    })

    if (hold.kind === 'full') return { success: false, error: FULL_MESSAGE }
    if (hold.kind === 'already') {
      return { success: false, error: ALREADY_TICKETED_MESSAGE }
    }

    const stripe = new Stripe(stripeConfig.secretKey, { apiVersion: STRIPE_API_VERSION })

    if (hold.previousSessionId) {
      const retired = await retirePreviousTicketSession(stripe, input.siteId, hold.previousSessionId)
      // The earlier session was already paid: they have a ticket, and the row is
      // now confirmed. Do not sell them a second one.
      if (retired === 'paid') return { success: false, error: ALREADY_TICKETED_MESSAGE }
    }

    const siteUrl = getSiteUrl({ subdomain: event.subdomain, customDomain: event.customDomain })
    const eventPath = `/events/${event.slug}`
    const metadata = buildEventTicketMetadata({
      siteId: input.siteId,
      eventId: event.id,
      registrationId: hold.registrationId,
    })

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: settings.ticketPriceId, quantity: 1 }],
        customer_email: email,
        success_url: `${siteUrl}${eventPath}?ticket_session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}${eventPath}?ticket_checkout=cancelled`,
        metadata,
        payment_intent_data: { metadata },
      })

      // No URL means we cannot send the buyer anywhere, but the session exists and
      // would still be payable — expire it rather than leaving a session that could
      // be paid for a registration we are about to release.
      if (!session.url) {
        await retirePreviousTicketSession(stripe, input.siteId, session.id)
        throw new Error('Stripe did not return a checkout URL')
      }

      // Recorded now (not at confirmation) so a later attempt on this seat can
      // find and retire this session. A failure here only costs that safeguard,
      // never the checkout itself, so it is logged rather than surfaced.
      await db
        .update(eventRegistrations)
        .set({ stripeSessionId: session.id, updatedAt: new Date() })
        .where(and(
          eq(eventRegistrations.id, hold.registrationId),
          eq(eventRegistrations.status, 'pending'),
        ))
        .catch((error) => {
          console.error('Failed to record the ticket checkout session on its hold:', error)
        })

      return { success: true, url: session.url }
    } catch (error) {
      console.error('Error creating event ticket checkout session:', error)
      // Release the seat we just held; leaving it would block the retry.
      await db
        .delete(eventRegistrations)
        .where(and(eq(eventRegistrations.id, hold.registrationId), eq(eventRegistrations.status, 'pending')))
      return { success: false, error: 'Could not start checkout. Please try again.' }
    }
  } catch (error) {
    console.error('Failed to start event ticket checkout:', error)
    return { success: false, error: GENERIC_ERROR }
  }
}

/**
 * Public: confirm a ticket after the Stripe success redirect.
 *
 * The session id comes from the URL, so nothing in it is trusted: the session is
 * re-fetched with the site's own Stripe keys and the confirmation re-validates
 * every metadata field. The webhook remains the primary path; this only makes the
 * result visible the moment the buyer lands back on the event page.
 */
export async function confirmEventTicketCheckoutActionImpl(input: {
  siteId: string
  sessionId: string
}): Promise<{ success: boolean; error?: string }> {
  if (!UUID_REGEX.test(input.siteId)) return { success: false, error: UNAVAILABLE_MESSAGE }

  const sessionId = typeof input.sessionId === 'string' ? input.sessionId.trim() : ''
  if (!STRIPE_SESSION_ID_REGEX.test(sessionId)) return { success: false, error: 'Invalid checkout session' }

  try {
    const clientIp = getClientIp(await headers()) || 'unknown'
    if (await isPersistentRateLimited(`event-ticket-confirm:${input.siteId}:${clientIp}`, CONFIRM_RATE_LIMIT, CONFIRM_RATE_WINDOW_MS)) {
      return { success: false, error: 'Too many requests. Please try again shortly.' }
    }

    const stripeConfig = await getStripeConfig(input.siteId)
    if (!stripeConfig) return { success: false, error: 'Ticket sales are not set up for this site yet.' }

    const stripe = new Stripe(stripeConfig.secretKey, { apiVersion: STRIPE_API_VERSION })
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    const result = await confirmEventTicketRegistration({
      siteId: input.siteId,
      metadata: session.metadata ?? null,
      paymentStatus: session.payment_status,
      stripeSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
      amountTotal: session.amount_total,
      currency: session.currency,
    })

    if (result.confirmed || result.alreadyProcessed) return { success: true }
    return { success: false, error: result.error || 'Could not confirm this ticket.' }
  } catch (error) {
    console.error('Failed to confirm event ticket checkout:', error)
    return { success: false, error: GENERIC_ERROR }
  }
}

/** Admin: registrations for a site, plus the per-event counts against capacity. */
export async function getEventRegistrationListActionImpl(input: {
  siteId: string
  eventId?: string
}): Promise<{
  data: EventRegistrationListItem[]
  events: EventRegistrationEventSummary[]
  /** True when the list hit ADMIN_LIST_LIMIT, so the screen can say so. */
  truncated: boolean
  error: string | null
}> {
  const empty = { data: [], events: [], truncated: false }
  if (!UUID_REGEX.test(input.siteId)) return { ...empty, error: 'Invalid site ID' }
  if (input.eventId && !UUID_REGEX.test(input.eventId)) {
    return { ...empty, error: 'Invalid event ID' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { ...empty, error: 'Authentication required' }
  if (user.role !== 'super_admin') return { ...empty, error: 'Access denied' }

  try {
    const [rows, summaryRows] = await Promise.all([
      db
        .select({
          id: eventRegistrations.id,
          eventId: eventRegistrations.eventId,
          status: eventRegistrations.status,
          name: eventRegistrations.name,
          email: eventRegistrations.email,
          amountTotal: eventRegistrations.amountTotal,
          currency: eventRegistrations.currency,
          reminderSentAt: eventRegistrations.reminderSentAt,
          followUpSentAt: eventRegistrations.followUpSentAt,
          checkedInAt: eventRegistrations.checkedInAt,
          createdAt: eventRegistrations.createdAt,
          eventTitle: events.title,
          eventSlug: events.slug,
        })
        .from(eventRegistrations)
        .innerJoin(events, eq(events.id, eventRegistrations.eventId))
        .where(input.eventId
          ? and(eq(eventRegistrations.siteId, input.siteId), eq(eventRegistrations.eventId, input.eventId))
          : eq(eventRegistrations.siteId, input.siteId))
        .orderBy(desc(eventRegistrations.createdAt))
        .limit(ADMIN_LIST_LIMIT),
      db
        .select({
          id: events.id,
          title: events.title,
          slug: events.slug,
          contentBlocks: events.contentBlocks,
          confirmedCount: sql<number>`count(${eventRegistrations.id}) filter (where ${eventRegistrations.status} = 'confirmed')::int`,
          pendingCount: sql<number>`count(${eventRegistrations.id}) filter (where ${eventRegistrations.status} = 'pending')::int`,
          checkedInCount: sql<number>`count(${eventRegistrations.id}) filter (where ${eventRegistrations.status} = 'confirmed' and ${eventRegistrations.checkedInAt} is not null)::int`,
        })
        .from(events)
        .leftJoin(eventRegistrations, eq(eventRegistrations.eventId, events.id))
        .where(eq(events.siteId, input.siteId))
        .groupBy(events.id),
    ])

    // Only events that take signups or already have some are worth listing.
    const summaries: EventRegistrationEventSummary[] = summaryRows
      .map((row) => {
        const settings = readEventRegistrationSettings(row.contentBlocks)
        const fields = extractEventContentFields(row.contentBlocks)
        return {
          id: row.id,
          title: row.title,
          slug: row.slug,
          event_date: fields.eventDate ?? null,
          event_time: fields.eventTime ?? null,
          mode: settings.mode,
          capacity: settings.capacity,
          confirmed_count: row.confirmedCount ?? 0,
          pending_count: row.pendingCount ?? 0,
          checked_in_count: row.checkedInCount ?? 0,
        }
      })
      .filter((summary) => summary.mode !== 'none' || summary.confirmed_count > 0 || summary.pending_count > 0)
      .sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''))

    return {
      data: rows.map((row) => ({
        id: row.id,
        event_id: row.eventId,
        event_title: row.eventTitle,
        event_slug: row.eventSlug,
        status: row.status,
        name: row.name,
        email: row.email,
        amount_total: row.amountTotal ?? null,
        currency: row.currency ?? null,
        reminder_sent_at: isoOrNull(row.reminderSentAt),
        follow_up_sent_at: isoOrNull(row.followUpSentAt),
        checked_in_at: isoOrNull(row.checkedInAt),
        created_at: row.createdAt?.toISOString() ?? '',
      })),
      events: summaries,
      truncated: rows.length === ADMIN_LIST_LIMIT,
      error: null,
    }
  } catch (error) {
    console.error('Failed to load event registrations:', error)
    return { ...empty, error: 'Could not load registrations.' }
  }
}

/**
 * Admin: remove a registration.
 *
 * Cancelling rather than deleting keeps the paid record (and its Stripe
 * references) for the owner's books while freeing the seat and letting that
 * person sign up again.
 */
export async function cancelEventRegistrationActionImpl(input: {
  registrationId: string
}): Promise<{ success: boolean; error: string | null }> {
  if (!UUID_REGEX.test(input.registrationId)) return { success: false, error: 'Invalid registration ID' }

  const user = await getAuthenticatedUser()
  if (!user) return { success: false, error: 'Authentication required' }
  if (user.role !== 'super_admin') return { success: false, error: 'Access denied' }

  try {
    const [cancelled] = await db
      .update(eventRegistrations)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(
        eq(eventRegistrations.id, input.registrationId),
        ne(eventRegistrations.status, 'cancelled'),
      ))
      .returning({ id: eventRegistrations.id })

    if (!cancelled) return { success: false, error: 'This registration was already removed.' }
    return { success: true, error: null }
  } catch (error) {
    console.error('Failed to cancel event registration:', error)
    return { success: false, error: 'Could not remove this registration.' }
  }
}
