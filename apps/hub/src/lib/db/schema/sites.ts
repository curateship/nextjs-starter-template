import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'

export const sites = pgTable('sites', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  subdomain: varchar('subdomain', { length: 100 }).notNull().unique(),
  customDomain: varchar('custom_domain', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  isTemplate: boolean('is_template').notNull().default(false),
  settings: jsonb('settings').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_sites_user_id').on(table.userId),
  index('idx_sites_status').on(table.status),
  index('idx_sites_subdomain').on(table.subdomain),
  index('idx_sites_custom_domain').on(table.customDomain),
])

export const sitesRelations = relations(sites, ({ one }) => ({
  user: one(users, {
    fields: [sites.userId],
    references: [users.id],
  }),
}))
