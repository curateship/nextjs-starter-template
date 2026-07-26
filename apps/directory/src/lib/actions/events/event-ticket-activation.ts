// Turning a completed Stripe payment into a confirmed event registration.
//
// Shared by the Stripe webhook (the primary path) and the success-redirect
// confirmation action (so the visitor sees "you're registered" immediately).
// Both are idempotent: the update is guarded on the row still being unconfirmed,
// and stripe_session_id / stripe_payment_intent_id are uniquely indexed.

import { and, eq, ne } from 'drizzle-orm'

import { createHubNotificationForSuperAdmins } from '@/lib/actions/notifications/notification-service'
import { db } from '@/lib/db'
import { eventRegistrations, events } from '@/lib/db/schema'
import { extractEventContentFields } from '@/lib/utils/calendar'
import { UUID_REGEX } from '@/lib/utils/validation'
import { sendEventRegistrationEmail } from './event-registration-email'

export const EVENT_TICKET_COMMERCE_TYPE = 'event_ticket'

export function isEventTicketPurchaseMetadata(metadata: Record<string, string | undefined> | null | undefined) {
  return metadata?.commerceType === EVENT_TICKET_COMMERCE_TYPE
}

/** Stripe metadata is a flat string map, so this stays a Record for assignability. */
export function buildEventTicketMetadata(params: {
  siteId: string
  eventId: string
  registrationId: string
}): Record<string, string> {
  return {
    commerceType: EVENT_TICKET_COMMERCE_TYPE,
    siteId: params.siteId,
    eventId: params.eventId,
    registrationId: params.registrationId,
  }
}

/**
 * Confirm the pending registration a paid checkout was holding.
 *
 * Every metadata field is untrusted and re-validated against the database. The
 * seat hold may already have lapsed by the time payment lands, in which case the
 * event can end up one over capacity — a paid attendee is never turned away, and
 * the admin registrations screen shows the count against capacity so the owner
 * can see it.
 */
export async function confirmEventTicketRegistration(params: {
  /** Site resolved from the verified webhook signature, or from a server-side session lookup. */
  siteId: string
  metadata: Record<string, string | undefined> | null | undefined
  paymentStatus: string | null | undefined
  stripeSessionId?: string | null
  stripePaymentIntentId?: string | null
  amountTotal?: number | null
  currency?: string | null
}): Promise<{ confirmed: boolean; alreadyProcessed: boolean; error: string | null }> {
  const { metadata, siteId } = params

  if (!isEventTicketPurchaseMetadata(metadata)) {
    return { confirmed: false, alreadyProcessed: false, error: 'Not an event ticket purchase' }
  }
  if (params.paymentStatus !== 'paid') {
    return { confirmed: false, alreadyProcessed: false, error: 'Payment is not completed' }
  }

  const eventId = metadata?.eventId || ''
  const registrationId = metadata?.registrationId || ''

  if (
    !UUID_REGEX.test(siteId) ||
    metadata?.siteId !== siteId ||
    !UUID_REGEX.test(eventId) ||
    !UUID_REGEX.test(registrationId)
  ) {
    return { confirmed: false, alreadyProcessed: false, error: 'Invalid purchase metadata' }
  }

  const [row] = await db
    .select({
      id: eventRegistrations.id,
      status: eventRegistrations.status,
      name: eventRegistrations.name,
      email: eventRegistrations.email,
      confirmationSentAt: eventRegistrations.confirmationSentAt,
      stripeSessionId: eventRegistrations.stripeSessionId,
      stripePaymentIntentId: eventRegistrations.stripePaymentIntentId,
      eventTitle: events.title,
      eventSlug: events.slug,
      eventContentBlocks: events.contentBlocks,
    })
    .from(eventRegistrations)
    .innerJoin(events, eq(events.id, eventRegistrations.eventId))
    .where(and(
      eq(eventRegistrations.id, registrationId),
      eq(eventRegistrations.siteId, siteId),
      eq(eventRegistrations.eventId, eventId),
    ))
    .limit(1)

  if (!row) {
    console.error('Event ticket confirmation rejected: no matching registration', { siteId, eventId, registrationId })
    return { confirmed: false, alreadyProcessed: false, error: 'Registration not found' }
  }

  if (row.status === 'confirmed') {
    // A repeat delivery of the payment that already confirmed this seat is the
    // normal idempotent case and stays quiet. A DIFFERENT payment arriving for an
    // already-paid seat means someone was charged for a ticket they cannot be
    // given, so it is logged loudly with the payment reference to refund. The
    // checkout path expires a seat's previous Stripe session precisely so this
    // does not happen; reaching here means that safeguard did not hold.
    const samePayment =
      (params.stripeSessionId != null && params.stripeSessionId === row.stripeSessionId) ||
      (params.stripePaymentIntentId != null && params.stripePaymentIntentId === row.stripePaymentIntentId)

    if (!samePayment) {
      console.error(
        'Event ticket paid twice for one seat — refund required',
        {
          registrationId,
          eventId,
          siteId,
          email: row.email,
          alreadyConfirmedBy: row.stripePaymentIntentId ?? row.stripeSessionId,
          duplicatePayment: params.stripePaymentIntentId ?? params.stripeSessionId,
          amountTotal: params.amountTotal,
          currency: params.currency,
        },
      )
      return {
        confirmed: false,
        alreadyProcessed: false,
        error: 'Your payment went through, but this seat was already claimed by another checkout. Please contact us for a refund.',
      }
    }

    return { confirmed: false, alreadyProcessed: true, error: null }
  }
  if (row.status === 'cancelled') {
    // The owner removed the signup while checkout was in flight. The money was
    // taken, so the attendee goes back on the list and the owner can refund and
    // remove again if that was deliberate.
    console.warn('Event ticket confirmation reinstating a cancelled registration', { registrationId })
  }

  const now = new Date()
  // Guarded on "not already confirmed" so concurrent webhook deliveries flip once.
  const [confirmedRow] = await db
    .update(eventRegistrations)
    .set({
      status: 'confirmed',
      stripeSessionId: params.stripeSessionId || null,
      stripePaymentIntentId: params.stripePaymentIntentId || null,
      amountTotal: params.amountTotal ?? null,
      currency: params.currency || null,
      updatedAt: now,
    })
    .where(and(
      eq(eventRegistrations.id, registrationId),
      ne(eventRegistrations.status, 'confirmed'),
    ))
    .returning({ id: eventRegistrations.id })

  if (!confirmedRow) {
    return { confirmed: false, alreadyProcessed: true, error: null }
  }

  const fields = extractEventContentFields(row.eventContentBlocks)

  if (!row.confirmationSentAt) {
    try {
      const email = await sendEventRegistrationEmail({
        templateKey: 'event_registration_confirmation',
        siteId,
        event: {
          slug: row.eventSlug,
          title: row.eventTitle,
          eventDate: fields.eventDate,
          eventTime: fields.eventTime,
          venueName: fields.venueName,
          venueAddress: fields.venueAddress,
        },
        attendeeName: row.name,
        attendeeEmail: row.email,
      })
      if (email.sent) {
        await db
          .update(eventRegistrations)
          .set({ confirmationSentAt: new Date(), updatedAt: new Date() })
          .where(eq(eventRegistrations.id, registrationId))
      }
    } catch (error) {
      // The ticket is paid and recorded; a failed email must not undo that.
      console.error('Failed to send ticket confirmation email:', error)
    }
  }

  try {
    await createHubNotificationForSuperAdmins({
      type: 'event_registration',
      siteId,
      sourceId: registrationId,
      title: 'Event ticket purchased',
      message: `${row.email} bought a ticket for "${row.eventTitle}".`,
      targetHref: '/admin/events/registrations',
      metadata: { registration_id: registrationId, event_id: eventId },
    })
  } catch (error) {
    console.error('Failed to create event registration notification:', error)
  }

  return { confirmed: true, alreadyProcessed: false, error: null }
}
