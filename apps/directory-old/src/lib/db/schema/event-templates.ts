import { pgTable, uuid, varchar, jsonb, timestamp, index, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'

// Event templates own block structure (which blocks, order, template-owned
// settings); each event row stores only block values, merged at read time.
// Mirrors directory_templates / category_templates (see ./category-templates.ts).
export const eventTemplates = pgTable('event_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  contentBlocks: jsonb('content_blocks').notNull().default({}),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_event_templates_site').on(table.siteId),
])

export const eventTemplatesRelations = relations(eventTemplates, ({ one }) => ({
  site: one(sites, {
    fields: [eventTemplates.siteId],
    references: [sites.id],
  }),
}))
