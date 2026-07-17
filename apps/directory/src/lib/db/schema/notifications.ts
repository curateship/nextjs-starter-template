import { relations, sql } from 'drizzle-orm'
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { authUsers } from './auth-users'
import { sites } from './sites'

export const hubNotifications = pgTable('hub_notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  recipientUserId: text('recipient_user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  sourceId: uuid('source_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  targetHref: text('target_href').notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('hub_notifications_type_check', sql`${table.type} in ('product_order', 'directory_claim', 'directory_owner_edit', 'directory_featured', 'newsletter_paused', 'directory_featured_expired')`),
  uniqueIndex('idx_hub_notifications_recipient_type_source').on(table.recipientUserId, table.type, table.sourceId),
  index('idx_hub_notifications_recipient_created').on(table.recipientUserId, table.createdAt.desc(), table.id),
  index('idx_hub_notifications_site_created').on(table.siteId, table.createdAt.desc()),
])

export const hubNotificationsRelations = relations(hubNotifications, ({ one }) => ({
  recipient: one(authUsers, {
    fields: [hubNotifications.recipientUserId],
    references: [authUsers.id],
  }),
  site: one(sites, {
    fields: [hubNotifications.siteId],
    references: [sites.id],
  }),
}))

export type HubNotification = typeof hubNotifications.$inferSelect
