import { pgTable, uuid, varchar, boolean, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'

export const siteIntegrations = pgTable('site_integrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  integrationType: varchar('integration_type', { length: 50 }).notNull(),
  config: jsonb('config').notNull(),
  isEnabled: boolean('is_enabled').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_site_integrations_unique').on(table.siteId, table.integrationType),
  index('idx_site_integrations_site_id').on(table.siteId),
])

export const siteIntegrationsRelations = relations(siteIntegrations, ({ one }) => ({
  site: one(sites, {
    fields: [siteIntegrations.siteId],
    references: [sites.id],
  }),
}))
