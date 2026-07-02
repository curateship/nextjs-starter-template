import { relations, sql } from 'drizzle-orm'
import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

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

export const directoryOwnerEditRequestStatusEnum = pgEnum('directory_owner_edit_request_status_enum', [
  'pending',
  'approved',
  'rejected',
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

export const directoryOwnerEditRequests = pgTable('directory_owner_edit_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  directoryId: uuid('directory_id').notNull().references(() => directories.id, { onDelete: 'cascade' }),
  claimId: uuid('claim_id').notNull().references(() => directoryClaims.id, { onDelete: 'cascade' }),
  submittedByUserId: text('submitted_by_user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  status: directoryOwnerEditRequestStatusEnum('status').notNull().default('pending'),
  listingValues: jsonb('listing_values').notNull().default({}),
  contentBlocks: jsonb('content_blocks').notNull().default({}),
  categoryIds: jsonb('category_ids').notNull().default([]),
  primaryCategoryId: uuid('primary_category_id'),
  reviewedByUserId: text('reviewed_by_user_id').references(() => authUsers.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_directory_owner_edit_requests_one_pending')
    .on(table.claimId)
    .where(sql`${table.status} = 'pending'`),
  index('idx_directory_owner_edit_requests_site_status_created').on(table.siteId, table.status, table.createdAt.desc(), table.id),
  index('idx_directory_owner_edit_requests_directory_status').on(table.directoryId, table.status),
  index('idx_directory_owner_edit_requests_claim_status').on(table.claimId, table.status),
])

export const directoryOwnerEditRequestsRelations = relations(directoryOwnerEditRequests, ({ one }) => ({
  site: one(sites, {
    fields: [directoryOwnerEditRequests.siteId],
    references: [sites.id],
  }),
  directory: one(directories, {
    fields: [directoryOwnerEditRequests.directoryId],
    references: [directories.id],
  }),
  claim: one(directoryClaims, {
    fields: [directoryOwnerEditRequests.claimId],
    references: [directoryClaims.id],
  }),
  submitter: one(authUsers, {
    fields: [directoryOwnerEditRequests.submittedByUserId],
    references: [authUsers.id],
  }),
  reviewer: one(authUsers, {
    fields: [directoryOwnerEditRequests.reviewedByUserId],
    references: [authUsers.id],
  }),
}))
