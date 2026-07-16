import { sql } from 'drizzle-orm'
import { pgTable, uuid, varchar, text, integer, doublePrecision, jsonb, timestamp, uniqueIndex, index, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'
import { directoryTemplates } from './directory-templates'

export const directoryStatusEnum = pgEnum('directory_status_enum', ['draft', 'published'])

export const directories = pgTable('directory', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').notNull().references(() => directoryTemplates.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  metaDescription: text('meta_description'),
  status: directoryStatusEnum('status').notNull().default('draft'),
  displayOrder: integer('display_order').notNull().default(0),
  contentBlocks: jsonb('content_blocks').default({}),
  featuredImage: text('featured_image'),
  sourceType: varchar('source_type', { length: 50 }),
  sourceId: varchar('source_id', { length: 255 }),
  // Geocoded from the core block address for map views; geocodedAddress caches the
  // address that produced the coordinates so unchanged addresses skip re-geocoding.
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  geocodedAddress: text('geocoded_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_directories_site_slug').on(table.siteId, table.slug),
  uniqueIndex('idx_directories_site_source')
    .on(table.siteId, table.sourceType, table.sourceId)
    .where(sql`${table.sourceType} is not null and ${table.sourceType} <> '' and ${table.sourceId} is not null and ${table.sourceId} <> ''`),
  index('idx_directories_site_display_created').on(table.siteId, table.displayOrder, table.createdAt.desc(), table.id),
  index('idx_directories_site_status').on(table.siteId, table.status, table.displayOrder, table.createdAt.desc(), table.id),
  index('idx_directories_template').on(table.templateId),
  index('idx_directories_site_updated').on(table.siteId, table.updatedAt.desc(), table.id),
  index('idx_directories_site_title_lower').on(table.siteId, sql`lower(${table.title})`, table.id),
])

export const directoriesRelations = relations(directories, ({ one }) => ({
  site: one(sites, {
    fields: [directories.siteId],
    references: [sites.id],
  }),
  template: one(directoryTemplates, {
    fields: [directories.templateId],
    references: [directoryTemplates.id],
  }),
}))
