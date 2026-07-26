import { relations, sql } from 'drizzle-orm'
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { events } from './events'
import { sites } from './sites'

// Attendee list for an event (see migration 195). The event's registration mode,
// capacity and ticket price live on its event-content block alongside the
// date/time, matching the block-JSON event model; this table is signups only.
//
// 'pending' exists only for paid tickets: the row is created when the Stripe
// Checkout session starts (holding the seat) and flipped to 'confirmed' once
// payment succeeds. A pending row stops holding its seat after
// REGISTRATION_HOLD_MINUTES, so abandoned checkouts release the seat.
export const eventRegistrationStatusEnum = pgEnum('event_registration_status_enum', [
  'pending',
  'confirmed',
  'cancelled',
])

export const eventRegistrations = pgTable('event_registrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  status: eventRegistrationStatusEnum('status').notNull().default('confirmed'),
  name: varchar('name', { length: 255 }).notNull(),
  // Always stored lowercased; the dedupe index below relies on that.
  email: varchar('email', { length: 255 }).notNull(),
  // Paid tickets only. Amount/currency are read back from Stripe, never the client.
  stripeSessionId: text('stripe_session_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  amountTotal: integer('amount_total'),
  currency: varchar('currency', { length: 10 }),
  confirmationSentAt: timestamp('confirmation_sent_at', { withTimezone: true }),
  reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // One live signup per person per event; cancelled rows may be replaced.
  uniqueIndex('idx_event_registrations_event_email')
    .on(table.eventId, sql`lower(${table.email})`)
    .where(sql`${table.status} <> 'cancelled'`),
  index('idx_event_registrations_site_created').on(table.siteId, table.createdAt.desc(), table.id),
  index('idx_event_registrations_event_status').on(table.eventId, table.status),
  uniqueIndex('idx_event_registrations_session')
    .on(table.stripeSessionId)
    .where(sql`${table.stripeSessionId} is not null`),
  uniqueIndex('idx_event_registrations_payment_intent')
    .on(table.stripePaymentIntentId)
    .where(sql`${table.stripePaymentIntentId} is not null`),
  index('idx_event_registrations_reminder_pending')
    .on(table.eventId)
    .where(sql`${table.status} = 'confirmed' and ${table.reminderSentAt} is null`),
])

export const eventRegistrationsRelations = relations(eventRegistrations, ({ one }) => ({
  site: one(sites, {
    fields: [eventRegistrations.siteId],
    references: [sites.id],
  }),
  event: one(events, {
    fields: [eventRegistrations.eventId],
    references: [events.id],
  }),
}))
