import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const rateLimitBuckets = pgTable('rate_limit_buckets', {
  rateKey: text('rate_key').primaryKey(),
  count: integer('count').notNull().default(1),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_rate_limit_buckets_reset_at').on(table.resetAt),
])
