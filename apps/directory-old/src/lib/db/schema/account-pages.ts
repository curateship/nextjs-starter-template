import { pgTable, uuid, varchar, text, boolean, integer, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { sites } from './sites'

// Legacy SQL table names still use "dashboard", but the runtime model is account pages.
export const siteAccountPageConfig = pgTable('site_dashboard_config', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }).unique(),
  settings: jsonb('settings').default({ navigation: null, footer: null }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const siteAccountPages = pgTable('site_dashboard_pages', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  metaDescription: text('meta_description'),
  contentBlocks: jsonb('content_blocks').default({}),
  displayOrder: integer('display_order').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  isPublished: boolean('is_published').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_dashboard_pages_site_slug_unique').on(table.siteId, table.slug),
  index('idx_dashboard_pages_site_published').on(table.siteId, table.isPublished),
  uniqueIndex('idx_dashboard_pages_one_default_per_site').on(table.siteId).where(sql`${table.isDefault} = true`),
])

export const siteAccountPageConfigRelations = relations(siteAccountPageConfig, ({ one }) => ({
  site: one(sites, {
    fields: [siteAccountPageConfig.siteId],
    references: [sites.id],
  }),
}))

export const siteAccountPagesRelations = relations(siteAccountPages, ({ one }) => ({
  site: one(sites, {
    fields: [siteAccountPages.siteId],
    references: [sites.id],
  }),
}))
