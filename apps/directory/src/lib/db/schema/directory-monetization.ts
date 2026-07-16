import { relations, sql } from 'drizzle-orm'
import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { authUsers } from './auth-users'
import { directories } from './directories'
import { directoryClaims } from './directory-claims'
import { sites } from './sites'

export const directoryFeaturedEntitlementStatusEnum = pgEnum('directory_featured_entitlement_status_enum', [
  'active',
  'revoked',
])

export const directoryFeaturedPlans = pgTable('directory_featured_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  stripePriceId: varchar('stripe_price_id', { length: 255 }).notNull(),
  durationDays: integer('duration_days').notNull(),
  priority: integer('priority').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_directory_featured_plans_site_active').on(table.siteId, table.isActive, table.displayOrder),
])

export const directoryFeaturedEntitlements = pgTable('directory_featured_entitlements', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  directoryId: uuid('directory_id').notNull().references(() => directories.id, { onDelete: 'cascade' }),
  claimId: uuid('claim_id').notNull().references(() => directoryClaims.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => directoryFeaturedPlans.id, { onDelete: 'restrict' }),
  stripeSessionId: varchar('stripe_session_id', { length: 255 }),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  amountTotal: integer('amount_total'),
  currency: varchar('currency', { length: 10 }),
  status: directoryFeaturedEntitlementStatusEnum('status').notNull().default('active'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  revokedByUserId: text('revoked_by_user_id').references(() => authUsers.id, { onDelete: 'set null' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokeNote: text('revoke_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_directory_featured_entitlements_session')
    .on(table.stripeSessionId)
    .where(sql`${table.stripeSessionId} is not null`),
  uniqueIndex('idx_directory_featured_entitlements_payment_intent')
    .on(table.stripePaymentIntentId)
    .where(sql`${table.stripePaymentIntentId} is not null`),
  index('idx_directory_featured_entitlements_directory_status').on(table.directoryId, table.status, table.endsAt),
  index('idx_directory_featured_entitlements_site_status_created').on(table.siteId, table.status, table.createdAt.desc(), table.id),
])

export const directoryFeaturedPlansRelations = relations(directoryFeaturedPlans, ({ one }) => ({
  site: one(sites, {
    fields: [directoryFeaturedPlans.siteId],
    references: [sites.id],
  }),
}))

export const directoryFeaturedEntitlementsRelations = relations(directoryFeaturedEntitlements, ({ one }) => ({
  site: one(sites, {
    fields: [directoryFeaturedEntitlements.siteId],
    references: [sites.id],
  }),
  directory: one(directories, {
    fields: [directoryFeaturedEntitlements.directoryId],
    references: [directories.id],
  }),
  claim: one(directoryClaims, {
    fields: [directoryFeaturedEntitlements.claimId],
    references: [directoryClaims.id],
  }),
  user: one(authUsers, {
    fields: [directoryFeaturedEntitlements.userId],
    references: [authUsers.id],
  }),
  plan: one(directoryFeaturedPlans, {
    fields: [directoryFeaturedEntitlements.planId],
    references: [directoryFeaturedPlans.id],
  }),
}))
