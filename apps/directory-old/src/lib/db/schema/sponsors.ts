import { pgTable, uuid, varchar, text, boolean, integer, timestamp, index, date, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'

export const sponsors = pgTable('sponsors', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  url: text('url').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_sponsors_site_id').on(table.siteId),
  index('idx_sponsors_site_active').on(table.siteId, table.isActive),
  index('idx_sponsors_site_order').on(table.siteId, table.displayOrder, table.createdAt),
])

export const sponsorsRelations = relations(sponsors, ({ one }) => ({
  site: one(sites, {
    fields: [sponsors.siteId],
    references: [sites.id],
  }),
}))

export const sponsorDailyAnalytics = pgTable('sponsor_daily_analytics', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  sponsorId: uuid('sponsor_id').notNull().references(() => sponsors.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  placement: varchar('placement', { length: 64 }).notNull().default('post_editor'),
  sourcePath: text('source_path').notNull().default('/'),
  postId: uuid('post_id'),
  impressions: integer('impressions').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_sponsor_daily_analytics_unique').on(table.sponsorId, table.day, table.placement, table.sourcePath),
  index('idx_sponsor_daily_analytics_sponsor_day').on(table.sponsorId, table.day),
  index('idx_sponsor_daily_analytics_site_day').on(table.siteId, table.day),
])

export const sponsorPortalLinks = pgTable('sponsor_portal_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  sponsorId: uuid('sponsor_id').notNull().references(() => sponsors.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_sponsor_portal_links_token_hash').on(table.tokenHash),
  uniqueIndex('idx_sponsor_portal_links_sponsor').on(table.sponsorId),
  index('idx_sponsor_portal_links_site').on(table.siteId),
])
