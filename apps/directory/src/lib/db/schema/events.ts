import { pgTable, uuid, varchar, text, boolean, integer, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'
import { eventTemplates } from './event-templates'

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  // Template owns block structure; this row stores only block values (plus _settings)
  templateId: uuid('template_id').notNull().references(() => eventTemplates.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  metaDescription: text('meta_description'),
  isPublished: boolean('is_published').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  contentBlocks: jsonb('content_blocks').default({}),
  featuredImage: text('featured_image'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('unique_events_slug_per_site').on(table.siteId, table.slug),
  index('idx_events_template').on(table.templateId),
])

export const eventsRelations = relations(events, ({ one }) => ({
  site: one(sites, {
    fields: [events.siteId],
    references: [sites.id],
  }),
  template: one(eventTemplates, {
    fields: [events.templateId],
    references: [eventTemplates.id],
  }),
}))
