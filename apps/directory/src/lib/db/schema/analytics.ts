import { pgTable, uuid, integer, jsonb, timestamp, index, date, uniqueIndex } from 'drizzle-orm/pg-core'
import { sites } from './sites'

export const analyticDailyVisitors = pgTable('analytic_daily_visitors', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  pageViews: integer('page_views').notNull().default(0),
  uniqueVisitors: integer('unique_visitors').notNull().default(0),
  pages: jsonb('pages').notNull().default({}),
  referrers: jsonb('referrers').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_analytic_daily_visitors_unique').on(table.siteId, table.day),
  index('idx_analytic_daily_visitors_site_day').on(table.siteId, table.day),
])
