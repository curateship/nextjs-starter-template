import { pgTable, uuid, text, bigint, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { sites } from './sites'

export const media = pgTable('media', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  altText: text('alt_text'),
  fileSize: bigint('file_size', { mode: 'number' }).notNull(),
  mimeType: text('mime_type').notNull(),
  fileType: text('file_type').notNull().default('image'),
  storagePath: text('storage_path').notNull(),
  publicUrl: text('public_url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_media_user_id').on(table.userId),
  index('idx_media_site_id').on(table.siteId),
  index('idx_media_user_site').on(table.userId, table.siteId),
])

export const mediaRelations = relations(media, ({ one }) => ({
  user: one(users, {
    fields: [media.userId],
    references: [users.id],
  }),
  site: one(sites, {
    fields: [media.siteId],
    references: [sites.id],
  }),
}))
