import { relations, sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { authUsers } from './auth-users'
import { directories } from './directories'
import { sites } from './sites'

export const directorySaveCollections = pgTable('directory_save_collections', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),
  defaultKey: varchar('default_key', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_directory_save_collections_site_user_default')
    .on(table.siteId, table.userId, table.defaultKey)
    .where(sql`${table.defaultKey} is not null`),
  index('idx_directory_save_collections_site_user_created').on(table.siteId, table.userId, table.createdAt.asc(), table.id),
])

export const directorySaveItems = pgTable('directory_save_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  collectionId: uuid('collection_id').notNull().references(() => directorySaveCollections.id, { onDelete: 'cascade' }),
  directoryId: uuid('directory_id').notNull().references(() => directories.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_directory_save_items_collection_directory').on(table.collectionId, table.directoryId),
  index('idx_directory_save_items_site_user_created').on(table.siteId, table.userId, table.createdAt.desc(), table.id),
  index('idx_directory_save_items_directory_user').on(table.directoryId, table.userId),
])

export const directorySaveCollectionsRelations = relations(directorySaveCollections, ({ one, many }) => ({
  site: one(sites, {
    fields: [directorySaveCollections.siteId],
    references: [sites.id],
  }),
  user: one(authUsers, {
    fields: [directorySaveCollections.userId],
    references: [authUsers.id],
  }),
  items: many(directorySaveItems),
}))

export const directorySaveItemsRelations = relations(directorySaveItems, ({ one }) => ({
  site: one(sites, {
    fields: [directorySaveItems.siteId],
    references: [sites.id],
  }),
  user: one(authUsers, {
    fields: [directorySaveItems.userId],
    references: [authUsers.id],
  }),
  collection: one(directorySaveCollections, {
    fields: [directorySaveItems.collectionId],
    references: [directorySaveCollections.id],
  }),
  directory: one(directories, {
    fields: [directorySaveItems.directoryId],
    references: [directories.id],
  }),
}))
