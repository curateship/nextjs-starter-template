import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, index, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { sites } from './sites'

export const aiAgentAutomations = pgTable('ai_agent_automations', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  prompt: text('prompt').notNull().default(''),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  provider: varchar('provider', { length: 50 }).notNull().default('openai'),
  model: varchar('model', { length: 120 }).notNull().default('gpt-5.5'),
  recurrence: jsonb('recurrence').default({}).notNull(),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastRunStatus: varchar('last_run_status', { length: 20 }),
  lockToken: varchar('lock_token', { length: 120 }),
  lockStartedAt: timestamp('lock_started_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_ai_agent_automations_site').on(table.siteId),
  index('idx_ai_agent_automations_status').on(table.status),
  index('idx_ai_agent_automations_next_run').on(table.nextRunAt),
  check('ai_agent_automations_status_check', sql`${table.status} in ('draft', 'active', 'paused')`),
  check('ai_agent_automations_provider_check', sql`${table.provider} in ('openai', 'anthropic', 'google_ai')`),
  check('ai_agent_automations_last_run_status_check', sql`${table.lastRunStatus} is null or ${table.lastRunStatus} in ('running', 'success', 'failed')`),
])

export const aiAgentAutomationReferences = pgTable('ai_agent_automation_references', {
  id: uuid('id').defaultRandom().primaryKey(),
  automationId: uuid('automation_id').notNull().references(() => aiAgentAutomations.id, { onDelete: 'cascade' }),
  referenceType: varchar('reference_type', { length: 20 }).notNull(),
  label: varchar('label', { length: 255 }).notNull(),
  sourceUrl: text('source_url'),
  storagePath: text('storage_path'),
  mimeType: varchar('mime_type', { length: 255 }),
  fileSize: integer('file_size'),
  extractedText: text('extracted_text').notNull().default(''),
  metadata: jsonb('metadata').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_ai_agent_automation_refs_automation').on(table.automationId),
  check('ai_agent_automation_references_type_check', sql`${table.referenceType} in ('file', 'url')`),
  check('ai_agent_automation_references_source_check', sql`(${table.referenceType} = 'url' and ${table.sourceUrl} is not null) or (${table.referenceType} = 'file' and ${table.storagePath} is not null)`),
])

export const aiAgentAutomationRuns = pgTable('ai_agent_automation_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  automationId: uuid('automation_id').notNull().references(() => aiAgentAutomations.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('running'),
  triggerType: varchar('trigger_type', { length: 20 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  model: varchar('model', { length: 120 }).notNull(),
  promptSnapshot: text('prompt_snapshot').notNull().default(''),
  referencesSnapshot: jsonb('references_snapshot').default([]).notNull(),
  output: text('output'),
  error: text('error'),
  durationMs: integer('duration_ms'),
  usage: jsonb('usage').default({}).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('idx_ai_agent_automation_runs_automation').on(table.automationId),
  index('idx_ai_agent_automation_runs_started').on(table.startedAt),
  check('ai_agent_automation_runs_status_check', sql`${table.status} in ('running', 'success', 'failed')`),
  check('ai_agent_automation_runs_trigger_type_check', sql`${table.triggerType} in ('manual', 'schedule')`),
  check('ai_agent_automation_runs_provider_check', sql`${table.provider} in ('openai', 'anthropic', 'google_ai')`),
])

export const aiAgentAutomationsRelations = relations(aiAgentAutomations, ({ one, many }) => ({
  site: one(sites, {
    fields: [aiAgentAutomations.siteId],
    references: [sites.id],
  }),
  references: many(aiAgentAutomationReferences),
  runs: many(aiAgentAutomationRuns),
}))

export const aiAgentAutomationReferencesRelations = relations(aiAgentAutomationReferences, ({ one }) => ({
  automation: one(aiAgentAutomations, {
    fields: [aiAgentAutomationReferences.automationId],
    references: [aiAgentAutomations.id],
  }),
}))

export const aiAgentAutomationRunsRelations = relations(aiAgentAutomationRuns, ({ one }) => ({
  automation: one(aiAgentAutomations, {
    fields: [aiAgentAutomationRuns.automationId],
    references: [aiAgentAutomations.id],
  }),
}))
