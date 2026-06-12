import { pgTable, uuid, varchar, text, boolean, integer, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { sites } from './sites'
import { categoryTemplates } from './category-templates'

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  // Template owns block structure; this row stores only block values (plus _settings)
  templateId: uuid('template_id').notNull().references(() => categoryTemplates.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  parentId: uuid('parent_id'),
  featuredImage: text('featured_image'),
  metaDescription: text('meta_description'),
  contentBlocks: jsonb('content_blocks').default({}),
  isPublished: boolean('is_published').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_categories_site_slug').on(table.siteId, table.slug),
  index('idx_categories_parent_id').on(table.parentId),
  index('idx_categories_template').on(table.templateId),
])

export const contentCategoryRelationships = pgTable('category_relationships', {
  id: uuid('id').defaultRandom().primaryKey(),
  contentId: uuid('content_id').notNull(),
  contentType: varchar('content_type', { length: 50 }).notNull(),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_ccr_unique').on(table.contentId, table.categoryId, table.contentType),
  uniqueIndex('idx_ccr_primary_content').on(table.contentId, table.contentType).where(sql`${table.isPrimary} = true`),
  index('idx_ccr_content').on(table.contentId, table.contentType),
  index('idx_ccr_category_id').on(table.categoryId),
  index('idx_ccr_category_content').on(table.categoryId, table.contentType, table.contentId),
])

export const categoriesRelations = relations(categories, ({ one }) => ({
  site: one(sites, {
    fields: [categories.siteId],
    references: [sites.id],
  }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
  }),
  template: one(categoryTemplates, {
    fields: [categories.templateId],
    references: [categoryTemplates.id],
  }),
}))
