import { pgTable, uuid, varchar, text, boolean, integer, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { sites } from './sites'

export const pages = pgTable('pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  metaDescription: text('meta_description'),
  metaKeywords: text('meta_keywords'),
  template: varchar('template', { length: 50 }).notNull().default('default'),
  isHomepage: boolean('is_homepage').notNull().default(false),
  isPublished: boolean('is_published').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  contentBlocks: jsonb('content_blocks').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_pages_site_slug_unique').on(table.siteId, table.slug),
  index('idx_pages_site_published').on(table.siteId, table.isPublished),
  uniqueIndex('idx_pages_one_homepage_per_site').on(table.siteId).where(sql`${table.isHomepage} = true`),
])

export const pagesRelations = relations(pages, ({ one }) => ({
  site: one(sites, {
    fields: [pages.siteId],
    references: [sites.id],
  }),
}))
