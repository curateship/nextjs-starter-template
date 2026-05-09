import { relations, sql } from 'drizzle-orm'
import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { authUsers } from './auth-users'
import { directories } from './directories'
import { sites } from './sites'

export const directoryClaimStatusEnum = pgEnum('directory_claim_status_enum', [
  'pending_email',
  'pending_review',
  'approved',
  'rejected',
  'revoked',
])

export const directoryClaims = pgTable('directory_claims', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  directoryId: uuid('directory_id').notNull().references(() => directories.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  status: directoryClaimStatusEnum('status').notNull().default('pending_email'),
  businessEmail: varchar('business_email', { length: 255 }).notNull(),
  businessEmailVerifiedAt: timestamp('business_email_verified_at', { withTimezone: true }),
  verificationTokenHash: text('verification_token_hash'),
  verificationTokenExpiresAt: timestamp('verification_token_expires_at', { withTimezone: true }),
  claimantName: varchar('claimant_name', { length: 255 }),
  roleTitle: varchar('role_title', { length: 120 }),
  phone: varchar('phone', { length: 80 }),
  message: text('message'),
  proofUrl: text('proof_url'),
  domainMatches: boolean('domain_matches').notNull().default(false),
  reviewedByUserId: text('reviewed_by_user_id').references(() => authUsers.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_directory_claims_directory_user').on(table.directoryId, table.userId),
  uniqueIndex('idx_directory_claims_one_approved_per_directory')
    .on(table.directoryId)
    .where(sql`status = 'approved'`),
  index('idx_directory_claims_site_status_created').on(table.siteId, table.status, table.createdAt.desc(), table.id),
  index('idx_directory_claims_directory_status').on(table.directoryId, table.status),
  index('idx_directory_claims_token_hash').on(table.verificationTokenHash),
])

export const directoryClaimsRelations = relations(directoryClaims, ({ one }) => ({
  site: one(sites, {
    fields: [directoryClaims.siteId],
    references: [sites.id],
  }),
  directory: one(directories, {
    fields: [directoryClaims.directoryId],
    references: [directories.id],
  }),
  user: one(authUsers, {
    fields: [directoryClaims.userId],
    references: [authUsers.id],
  }),
  reviewer: one(authUsers, {
    fields: [directoryClaims.reviewedByUserId],
    references: [authUsers.id],
  }),
}))
