import { pgTable, uuid, varchar, text, boolean, integer, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'

export const guidedForms = pgTable('guided_forms', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  headline: varchar('headline', { length: 255 }).notNull().default('Tell us what you need'),
  subhead: text('subhead').notNull().default('Answer a few quick questions and we will route you to the right next step.'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  contactSyncEnabled: boolean('contact_sync_enabled').notNull().default(false),
  adminNotificationEnabled: boolean('admin_notification_enabled').notNull().default(false),
  adminNotificationEmail: varchar('admin_notification_email', { length: 255 }),
  draftSteps: jsonb('draft_steps').notNull().default([]),
  draftOutcomes: jsonb('draft_outcomes').notNull().default([]),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_guided_forms_site_slug').on(table.siteId, table.slug),
  index('idx_guided_forms_site_status').on(table.siteId, table.status),
])

export const guidedFormVersions = pgTable('guided_form_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  formId: uuid('form_id').notNull().references(() => guidedForms.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  versionNumber: integer('version_number').notNull().default(1),
  headline: varchar('headline', { length: 255 }).notNull(),
  subhead: text('subhead').notNull().default(''),
  steps: jsonb('steps').notNull().default([]),
  outcomes: jsonb('outcomes').notNull().default([]),
  metadata: jsonb('metadata').default({}),
  publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_guided_form_versions_form_number').on(table.formId, table.versionNumber),
  index('idx_guided_form_versions_form_published').on(table.formId, table.publishedAt),
])

export const guidedFormSubmissions = pgTable('guided_form_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  formId: uuid('form_id').notNull().references(() => guidedForms.id, { onDelete: 'cascade' }),
  versionId: uuid('version_id').notNull().references(() => guidedFormVersions.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 20 }).notNull().default('completed'),
  contactEmail: varchar('contact_email', { length: 255 }),
  matchedOutcomeId: varchar('matched_outcome_id', { length: 100 }),
  answers: jsonb('answers').notNull().default({}),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_guided_form_submissions_form_created').on(table.formId, table.createdAt),
  index('idx_guided_form_submissions_site_email').on(table.siteId, table.contactEmail),
])

export const guidedFormsRelations = relations(guidedForms, ({ one, many }) => ({
  site: one(sites, {
    fields: [guidedForms.siteId],
    references: [sites.id],
  }),
  versions: many(guidedFormVersions),
  submissions: many(guidedFormSubmissions),
}))

export const guidedFormVersionsRelations = relations(guidedFormVersions, ({ one, many }) => ({
  form: one(guidedForms, {
    fields: [guidedFormVersions.formId],
    references: [guidedForms.id],
  }),
  site: one(sites, {
    fields: [guidedFormVersions.siteId],
    references: [sites.id],
  }),
  submissions: many(guidedFormSubmissions),
}))

export const guidedFormSubmissionsRelations = relations(guidedFormSubmissions, ({ one }) => ({
  form: one(guidedForms, {
    fields: [guidedFormSubmissions.formId],
    references: [guidedForms.id],
  }),
  version: one(guidedFormVersions, {
    fields: [guidedFormSubmissions.versionId],
    references: [guidedFormVersions.id],
  }),
  site: one(sites, {
    fields: [guidedFormSubmissions.siteId],
    references: [sites.id],
  }),
}))
