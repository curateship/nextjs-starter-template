import { relations } from 'drizzle-orm'
import { index, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { authUsers } from './auth-users'
import { categories } from './categories'
import { directories } from './directories'
import { sites } from './sites'

// Public "Add your listing" submissions feeding an admin review queue. A visitor
// submits a business, verifies their email (pending_email -> pending_review),
// then an admin approves it, which creates a real PUBLISHED directory listing.
// Mirrors event_submissions plus the directory_claims verification columns.
export const directorySubmissionStatusEnum = pgEnum('directory_submission_status_enum', [
  'pending_email',
  'pending_review',
  'approved',
  'rejected',
])

export const directorySubmissions = pgTable('directory_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  status: directorySubmissionStatusEnum('status').notNull().default('pending_email'),
  businessName: varchar('business_name', { length: 255 }).notNull(),
  address: varchar('address', { length: 500 }),
  description: text('description'),
  imageUrl: text('image_url'),
  // The email we verify AND publish as the listing's contact link on approval.
  contactEmail: varchar('contact_email', { length: 255 }).notNull(),
  contactEmailVerifiedAt: timestamp('contact_email_verified_at', { withTimezone: true }),
  // Only the SHA-256 hash of the verification token is stored; both null after use.
  verificationTokenHash: text('verification_token_hash'),
  verificationTokenExpiresAt: timestamp('verification_token_expires_at', { withTimezone: true }),
  // The category the submitter picked (validated to a published child category on submit).
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  // Set when approved: the listing this submission created (SET NULL if the
  // listing is later deleted, keeping the submission as an audit record).
  createdDirectoryId: uuid('created_directory_id').references(() => directories.id, { onDelete: 'set null' }),
  reviewedByUserId: text('reviewed_by_user_id').references(() => authUsers.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_directory_submissions_site_status_created').on(table.siteId, table.status, table.createdAt.desc(), table.id),
  index('idx_directory_submissions_token_hash').on(table.verificationTokenHash),
])

export const directorySubmissionsRelations = relations(directorySubmissions, ({ one }) => ({
  site: one(sites, {
    fields: [directorySubmissions.siteId],
    references: [sites.id],
  }),
  category: one(categories, {
    fields: [directorySubmissions.categoryId],
    references: [categories.id],
  }),
  createdDirectory: one(directories, {
    fields: [directorySubmissions.createdDirectoryId],
    references: [directories.id],
  }),
  reviewer: one(authUsers, {
    fields: [directorySubmissions.reviewedByUserId],
    references: [authUsers.id],
  }),
}))
