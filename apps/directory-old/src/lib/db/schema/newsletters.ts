import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, uniqueIndex, index, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'

export const newsletterContacts = pgTable('newsletter_contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  lastEngagedAt: timestamp('last_engaged_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_newsletter_contacts_site_email').on(table.siteId, table.email),
  index('idx_newsletter_contacts_site_status').on(table.siteId, table.status),
])

export const newsletters = pgTable('newsletters', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 255 }).notNull(),
  content: text('content').notNull().default(''),
  contentBlocks: jsonb('content_blocks').default({}),
  fromName: varchar('from_name', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  audienceFilter: jsonb('audience_filter').default({}),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  totalRecipients: integer('total_recipients').default(0),
  totalSent: integer('total_sent').default(0),
  totalOpened: integer('total_opened').default(0),
  totalClicked: integer('total_clicked').default(0),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_newsletters_site_status').on(table.siteId, table.status),
  index('idx_newsletters_scheduled').on(table.scheduledAt),
])

export const newsletterSourceStats = pgTable('newsletter_source_stats', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  sourceType: varchar('source_type', { length: 20 }).notNull(),
  sourceId: uuid('source_id').notNull(),
  stepOrder: integer('step_order').notNull().default(0),
  sent: integer('sent').notNull().default(0),
  delivered: integer('delivered').notNull().default(0),
  opened: integer('opened').notNull().default(0),
  clicked: integer('clicked').notNull().default(0),
  bounced: integer('bounced').notNull().default(0),
  complained: integer('complained').notNull().default(0),
  unsubscribed: integer('unsubscribed').notNull().default(0),
  duplicateSends: integer('duplicate_sends').notNull().default(0),
  firstSentAt: timestamp('first_sent_at', { withTimezone: true }),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  lastEventAt: timestamp('last_event_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_newsletter_source_stats_unique').on(table.siteId, table.sourceType, table.sourceId, table.stepOrder),
  index('idx_newsletter_source_stats_site').on(table.siteId),
  index('idx_newsletter_source_stats_source').on(table.sourceType, table.sourceId, table.stepOrder),
])

export const newsletterDeliveries = pgTable('newsletter_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').references(() => newsletterContacts.id, { onDelete: 'set null' }),
  sourceType: varchar('source_type', { length: 20 }).notNull(),
  sourceId: uuid('source_id').notNull(),
  stepOrder: integer('step_order').notNull().default(0),
  providerMessageId: varchar('provider_message_id', { length: 255 }).notNull(),
  isDuplicateSend: boolean('is_duplicate_send').notNull().default(false),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  firstOpenedAt: timestamp('first_opened_at', { withTimezone: true }),
  lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
  firstClickedAt: timestamp('first_clicked_at', { withTimezone: true }),
  lastClickedAt: timestamp('last_clicked_at', { withTimezone: true }),
  bouncedAt: timestamp('bounced_at', { withTimezone: true }),
  complainedAt: timestamp('complained_at', { withTimezone: true }),
  unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
  lastClickedUrl: text('last_clicked_url'),
  lastEventAt: timestamp('last_event_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_newsletter_deliveries_provider_msg').on(table.providerMessageId),
  index('idx_newsletter_deliveries_site_sent').on(table.siteId, table.sentAt),
  index('idx_newsletter_deliveries_contact_sent').on(table.contactId, table.sentAt),
  index('idx_newsletter_deliveries_source').on(table.sourceType, table.sourceId, table.stepOrder),
  index('idx_newsletter_deliveries_type_sent').on(table.sourceType, table.sentAt),
  index('idx_newsletter_deliveries_source_contact').on(table.sourceType, table.sourceId, table.contactId),
])

export const newsletterTemplates = pgTable('newsletter_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  contentBlocks: jsonb('content_blocks').notNull().default({}),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_newsletter_templates_site').on(table.siteId),
])

export const newsletterSegments = pgTable('newsletter_segments', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').default(''),
  segmentType: varchar('segment_type', { length: 20 }).notNull().default('static'),
  dynamicRule: jsonb('dynamic_rule'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_newsletter_segments_site').on(table.siteId),
])

export const newsletterSegmentContacts = pgTable('newsletter_segment_contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  segmentId: uuid('segment_id').notNull().references(() => newsletterSegments.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => newsletterContacts.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_segment_contacts_unique').on(table.segmentId, table.contactId),
  index('idx_segment_contacts_contact').on(table.contactId),
])

export const newsletterContactsRelations = relations(newsletterContacts, ({ one }) => ({
  site: one(sites, {
    fields: [newsletterContacts.siteId],
    references: [sites.id],
  }),
}))

export const newslettersRelations = relations(newsletters, ({ one }) => ({
  site: one(sites, {
    fields: [newsletters.siteId],
    references: [sites.id],
  }),
}))

export const newsletterSegmentContactsRelations = relations(newsletterSegmentContacts, ({ one }) => ({
  segment: one(newsletterSegments, {
    fields: [newsletterSegmentContacts.segmentId],
    references: [newsletterSegments.id],
  }),
  contact: one(newsletterContacts, {
    fields: [newsletterSegmentContacts.contactId],
    references: [newsletterContacts.id],
  }),
}))
