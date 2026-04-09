import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, uniqueIndex, index, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'

export const newsletterContacts = pgTable('newsletter_contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  engagementScore: integer('engagement_score').default(0),
  lastEngagedAt: timestamp('last_engaged_at', { withTimezone: true }),
  bounceCount: integer('bounce_count').default(0),
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

export const newsletterEvents = pgTable('newsletter_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').references(() => newsletterContacts.id, { onDelete: 'set null' }),
  eventType: varchar('event_type', { length: 20 }).notNull(),
  sourceType: varchar('source_type', { length: 20 }).notNull(),
  sourceId: uuid('source_id'),
  providerMessageId: varchar('provider_message_id', { length: 255 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_newsletter_events_site_created').on(table.siteId, table.createdAt),
  index('idx_newsletter_events_contact').on(table.contactId),
  index('idx_newsletter_events_source').on(table.sourceType, table.sourceId),
  index('idx_newsletter_events_provider_msg').on(table.providerMessageId),
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
