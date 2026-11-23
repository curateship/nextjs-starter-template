import { relations } from 'drizzle-orm'
import { index, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { authUsers } from './auth-users'
import { events } from './events'
import { sites } from './sites'

// Public "submit your event" submissions feeding an admin review queue. Approving
// one creates a DRAFT event (see event-submission-actions). Mirrors directory_claims.
export const eventSubmissionStatusEnum = pgEnum('event_submission_status_enum', [
  'pending',
  'approved',
  'rejected',
])

export const eventSubmissions = pgTable('event_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  status: eventSubmissionStatusEnum('status').notNull().default('pending'),
  eventName: varchar('event_name', { length: 255 }).notNull(),
  description: text('description'),
  // Free-text "when" — the owner sets the real structured date/time when
  // polishing the approved draft (submitters won't reliably use a date picker).
  dateTimeText: varchar('date_time_text', { length: 255 }),
  location: varchar('location', { length: 255 }),
  submitterEmail: varchar('submitter_email', { length: 255 }).notNull(),
  // Set when approved: the draft event this submission created (SET NULL if the
  // draft is later deleted, keeping the submission as an audit record).
  createdEventId: uuid('created_event_id').references(() => events.id, { onDelete: 'set null' }),
  reviewedByUserId: text('reviewed_by_user_id').references(() => authUsers.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_event_submissions_site_status_created').on(table.siteId, table.status, table.createdAt.desc(), table.id),
])

export const eventSubmissionsRelations = relations(eventSubmissions, ({ one }) => ({
  site: one(sites, {
    fields: [eventSubmissions.siteId],
    references: [sites.id],
  }),
  createdEvent: one(events, {
    fields: [eventSubmissions.createdEventId],
    references: [events.id],
  }),
  reviewer: one(authUsers, {
    fields: [eventSubmissions.reviewedByUserId],
    references: [authUsers.id],
  }),
}))
