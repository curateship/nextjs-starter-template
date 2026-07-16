import { pgTable, uuid, varchar, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'

export const directoryCustomBlocks = pgTable('directory_custom_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  layout: varchar('layout', { length: 40 }).notNull().default('stack'),
  fields: jsonb('fields').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_directory_custom_blocks_site_slug').on(table.siteId, table.slug),
])

export const directoryCustomBlocksRelations = relations(directoryCustomBlocks, ({ one }) => ({
  site: one(sites, {
    fields: [directoryCustomBlocks.siteId],
    references: [sites.id],
  }),
}))
