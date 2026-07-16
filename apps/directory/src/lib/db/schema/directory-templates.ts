import { pgTable, uuid, varchar, jsonb, timestamp, index, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'

export const directoryTemplates = pgTable('directory_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  contentBlocks: jsonb('content_blocks').notNull().default({}),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_directory_templates_site').on(table.siteId),
])

export const directoryTemplatesRelations = relations(directoryTemplates, ({ one }) => ({
  site: one(sites, {
    fields: [directoryTemplates.siteId],
    references: [sites.id],
  }),
}))
