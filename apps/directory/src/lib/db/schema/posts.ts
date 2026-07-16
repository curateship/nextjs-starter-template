import { pgTable, uuid, varchar, text, boolean, integer, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'
import { postTemplates } from './post-templates'

export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').notNull().references(() => postTemplates.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  metaDescription: text('meta_description'),
  metaKeywords: text('meta_keywords'),
  featuredImage: text('featured_image'),
  excerpt: text('excerpt'),
  content: text('content'),
  contentBlocks: jsonb('content_blocks').default({}),
  isPublished: boolean('is_published').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_posts_site_slug_unique').on(table.siteId, table.slug),
  index('idx_posts_site_published').on(table.siteId, table.isPublished),
  index('idx_posts_template').on(table.templateId),
])

export const postsRelations = relations(posts, ({ one }) => ({
  site: one(sites, {
    fields: [posts.siteId],
    references: [sites.id],
  }),
  template: one(postTemplates, {
    fields: [posts.templateId],
    references: [postTemplates.id],
  }),
}))
