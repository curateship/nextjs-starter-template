import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'
import { newsletterContacts } from './newsletters'

export const emailAutomations = pgTable('email_automations', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  triggerType: varchar('trigger_type', { length: 50 }).notNull(),
  triggerConfig: jsonb('trigger_config').default({}),
  goalType: varchar('goal_type', { length: 50 }),
  goalConfig: jsonb('goal_config').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_email_automations_site').on(table.siteId),
])

export const emailAutomationSteps = pgTable('email_automation_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  automationId: uuid('automation_id').notNull().references(() => emailAutomations.id, { onDelete: 'cascade' }),
  stepOrder: integer('step_order').notNull(),
  nodeType: varchar('node_type', { length: 20 }).notNull().default('email'),
  nodeConfig: jsonb('node_config').default({}),
  delayMinutes: integer('delay_minutes').notNull().default(0),
  subject: varchar('subject', { length: 255 }),
  content: text('content').notNull().default(''),
  contentBlocks: jsonb('content_blocks').default({}),
  fromName: varchar('from_name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_automation_steps_order').on(table.automationId, table.stepOrder),
])

export const emailAutomationEnrollments = pgTable('email_automation_enrollments', {
  id: uuid('id').defaultRandom().primaryKey(),
  automationId: uuid('automation_id').notNull().references(() => emailAutomations.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => newsletterContacts.id, { onDelete: 'cascade' }),
  currentStepOrder: integer('current_step_order').default(0),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  enrolledAt: timestamp('enrolled_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  goalMetAt: timestamp('goal_met_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  lastStepSentAt: timestamp('last_step_sent_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
}, (table) => [
  uniqueIndex('idx_enrollment_unique').on(table.automationId, table.contactId),
])

export const emailAutomationsRelations = relations(emailAutomations, ({ one, many }) => ({
  site: one(sites, {
    fields: [emailAutomations.siteId],
    references: [sites.id],
  }),
  steps: many(emailAutomationSteps),
  enrollments: many(emailAutomationEnrollments),
}))

export const emailAutomationStepsRelations = relations(emailAutomationSteps, ({ one }) => ({
  automation: one(emailAutomations, {
    fields: [emailAutomationSteps.automationId],
    references: [emailAutomations.id],
  }),
}))

export const emailAutomationEnrollmentsRelations = relations(emailAutomationEnrollments, ({ one }) => ({
  automation: one(emailAutomations, {
    fields: [emailAutomationEnrollments.automationId],
    references: [emailAutomations.id],
  }),
  contact: one(newsletterContacts, {
    fields: [emailAutomationEnrollments.contactId],
    references: [newsletterContacts.id],
  }),
}))
