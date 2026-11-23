import { relations } from 'drizzle-orm'
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { authUsers } from './auth-users'
import { directories } from './directories'
import { sites } from './sites'

// Admin-initiated invitations asking the business behind an unclaimed listing to
// claim it. One row per send attempt: the log powers the history column and the
// resend cooldown (a listing already invited within the cooldown is skipped).
export const directoryClaimOutreachStatusEnum = pgEnum('directory_claim_outreach_status_enum', [
  'sent',
  'failed',
])

export const directoryClaimOutreach = pgTable('directory_claim_outreach', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  directoryId: uuid('directory_id').notNull().references(() => directories.id, { onDelete: 'cascade' }),
  // The business contact email the invitation was sent to (stored lowercased).
  toEmail: varchar('to_email', { length: 255 }).notNull(),
  status: directoryClaimOutreachStatusEnum('status').notNull(),
  // Populated only for failed sends, for the admin to diagnose.
  error: text('error'),
  sentByUserId: text('sent_by_user_id').references(() => authUsers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // Newest send per listing: cooldown check + "last invited" column.
  index('idx_directory_claim_outreach_directory_created').on(table.directoryId, table.createdAt.desc()),
  // Per-site history, newest first.
  index('idx_directory_claim_outreach_site_created').on(table.siteId, table.createdAt.desc(), table.id),
])

// Recipients who opted out of claim outreach for a site. Kept separate from the
// send log so an opt-out survives even if the listing (and its log rows) is
// deleted. Suppression is per-site, per-email; the email is stored lowercased.
export const directoryClaimOutreachOptouts = pgTable('directory_claim_outreach_optouts', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_directory_claim_outreach_optouts_site_email').on(table.siteId, table.email),
])

export const directoryClaimOutreachRelations = relations(directoryClaimOutreach, ({ one }) => ({
  site: one(sites, {
    fields: [directoryClaimOutreach.siteId],
    references: [sites.id],
  }),
  directory: one(directories, {
    fields: [directoryClaimOutreach.directoryId],
    references: [directories.id],
  }),
  sentBy: one(authUsers, {
    fields: [directoryClaimOutreach.sentByUserId],
    references: [authUsers.id],
  }),
}))
