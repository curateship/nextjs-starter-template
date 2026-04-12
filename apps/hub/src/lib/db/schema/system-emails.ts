import { relations } from 'drizzle-orm'
import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { sites } from './sites'

export const systemEmailTemplateKeyEnum = pgEnum('system_email_template_key_enum', [
  'password_reset',
  'lead_magnet_delivery',
  'paid_purchase_delivery',
])

export const emailSystemTemplates = pgTable('email_system_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  templateKey: systemEmailTemplateKeyEnum('template_key').notNull(),
  scopeKey: varchar('scope_key', { length: 255 }).notNull(),
  siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }),
  subject: varchar('subject', { length: 255 }).notNull(),
  contentBlocks: jsonb('content_blocks').notNull().default({}),
  fromName: varchar('from_name', { length: 255 }),
  replyTo: varchar('reply_to', { length: 255 }),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_email_system_templates_scope').on(table.templateKey, table.scopeKey),
  index('idx_email_system_templates_site').on(table.siteId),
])

export const emailSystemTemplatesRelations = relations(emailSystemTemplates, ({ one }) => ({
  site: one(sites, {
    fields: [emailSystemTemplates.siteId],
    references: [sites.id],
  }),
}))
