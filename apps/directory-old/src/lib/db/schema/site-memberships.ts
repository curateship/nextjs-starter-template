import { relations } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { authUsers } from './auth-users'
import { sites } from './sites'

export const siteMemberships = pgTable('site_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  lastEngagedAt: timestamp('last_engaged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_site_memberships_site_user').on(table.siteId, table.userId),
  index('idx_site_memberships_site_role').on(table.siteId, table.role),
  index('idx_site_memberships_site_status').on(table.siteId, table.status),
  index('idx_site_memberships_site_created').on(table.siteId, table.createdAt.desc(), table.id),
  index('idx_site_memberships_site_last_engaged').on(table.siteId, table.lastEngagedAt.desc(), table.id),
])

export const siteMembershipsRelations = relations(siteMemberships, ({ one }) => ({
  site: one(sites, {
    fields: [siteMemberships.siteId],
    references: [sites.id],
  }),
  user: one(authUsers, {
    fields: [siteMemberships.userId],
    references: [authUsers.id],
  }),
}))
