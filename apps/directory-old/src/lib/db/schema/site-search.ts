import { sql } from 'drizzle-orm'
import { customType, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { sites } from './sites'

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector'
  },
})

export const siteSearchDocuments = pgTable('site_search_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  sourceType: varchar('source_type', { length: 30 }).notNull(),
  sourceId: text('source_id').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  image: text('image'),
  searchableText: text('searchable_text').notNull(),
  searchVector: tsvector('search_vector').generatedAlwaysAs(sql`to_tsvector('english', coalesce(searchable_text, ''))`),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_site_search_documents_source_unique').on(table.siteId, table.sourceType, table.sourceId),
  index('idx_site_search_documents_site_type').on(table.siteId, table.sourceType),
  index('idx_site_search_documents_vector').using('gin', table.searchVector),
])
