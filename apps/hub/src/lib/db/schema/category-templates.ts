import { pgTable, uuid, varchar, jsonb, timestamp, index, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'

// Category templates own block structure (which blocks, order, template-owned
// settings); each category row stores only block values, merged at read time.
// Mirrors directory_templates (see ./directory-templates.ts).
export const categoryTemplates = pgTable('category_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  contentBlocks: jsonb('content_blocks').notNull().default({}),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_category_templates_site').on(table.siteId),
])

export const categoryTemplatesRelations = relations(categoryTemplates, ({ one }) => ({
  site: one(sites, {
    fields: [categoryTemplates.siteId],
    references: [sites.id],
  }),
}))
