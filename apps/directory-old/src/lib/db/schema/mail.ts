import { relations } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { sites } from './sites'

export const mailDomains = pgTable('mail_domains', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  domain: varchar('domain', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull().default('mxroute'),
  status: varchar('status', { length: 30 }).notNull().default('setup_pending'),
  dnsStatus: jsonb('dns_status').default({}).notNull(),
  providerData: jsonb('provider_data').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_mail_domains_site').on(table.siteId),
  uniqueIndex('idx_mail_domains_site_domain').on(table.siteId, table.domain),
  index('idx_mail_domains_provider').on(table.provider),
])

export const mailboxes = pgTable('mailboxes', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  mailDomainId: uuid('mail_domain_id').notNull().references(() => mailDomains.id, { onDelete: 'cascade' }),
  localPart: varchar('local_part', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull().default('mxroute'),
  status: varchar('status', { length: 30 }).notNull().default('active'),
  quotaMb: integer('quota_mb').notNull().default(1024),
  usageMb: integer('usage_mb').notNull().default(0),
  dailySendLimit: integer('daily_send_limit').notNull().default(9600),
  sentToday: integer('sent_today').notNull().default(0),
  passwordEncrypted: text('password_encrypted'),
  providerSuspended: boolean('provider_suspended').notNull().default(false),
  providerData: jsonb('provider_data').default({}).notNull(),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_mailboxes_site_email').on(table.siteId, table.email),
  index('idx_mailboxes_domain_status').on(table.mailDomainId, table.status),
  index('idx_mailboxes_site_status').on(table.siteId, table.status),
])

export const mailDomainsRelations = relations(mailDomains, ({ one, many }) => ({
  site: one(sites, {
    fields: [mailDomains.siteId],
    references: [sites.id],
  }),
  mailboxes: many(mailboxes),
}))

export const mailboxesRelations = relations(mailboxes, ({ one }) => ({
  site: one(sites, {
    fields: [mailboxes.siteId],
    references: [sites.id],
  }),
  mailDomain: one(mailDomains, {
    fields: [mailboxes.mailDomainId],
    references: [mailDomains.id],
  }),
}))
