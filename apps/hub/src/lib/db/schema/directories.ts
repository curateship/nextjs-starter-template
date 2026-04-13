import { sql } from 'drizzle-orm'
import { pgTable, uuid, varchar, text, boolean, integer, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'

export const directories = pgTable('directory', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  metaDescription: text('meta_description'),
  isPublished: boolean('is_published').notNull().default(true),
  isPrivate: boolean('is_private').notNull().default(false),
  displayOrder: integer('display_order').notNull().default(0),
  contentBlocks: jsonb('content_blocks').default({}),
  featuredImage: text('featured_image'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_directories_site_slug').on(table.siteId, table.slug),
  index('idx_directories_site_display_created').on(table.siteId, table.displayOrder, table.createdAt.desc(), table.id),
  index('idx_directories_site_publish_private').on(table.siteId, table.isPublished, table.isPrivate, table.displayOrder, table.createdAt.desc(), table.id),
  index('idx_directories_site_updated').on(table.siteId, table.updatedAt.desc(), table.id),
  index('idx_directories_site_title_lower').on(table.siteId, sql`lower(${table.title})`, table.id),
])

export const directoriesRelations = relations(directories, ({ one }) => ({
  site: one(sites, {
    fields: [directories.siteId],
    references: [sites.id],
  }),
}))
