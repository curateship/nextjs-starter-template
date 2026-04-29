import { pgTable, uuid, varchar, text, boolean, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'

export const sponsors = pgTable('sponsors', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  url: text('url').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_sponsors_site_id').on(table.siteId),
  index('idx_sponsors_site_active').on(table.siteId, table.isActive),
  index('idx_sponsors_site_order').on(table.siteId, table.displayOrder, table.createdAt),
])

export const sponsorsRelations = relations(sponsors, ({ one }) => ({
  site: one(sites, {
    fields: [sponsors.siteId],
    references: [sites.id],
  }),
}))
