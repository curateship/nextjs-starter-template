import { relations, sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sites } from './sites'

export const siteAutomations = pgTable('site_automations', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  graph: jsonb('graph').notNull().default({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastRunStatus: varchar('last_run_status', { length: 20 }),
  lockToken: varchar('lock_token', { length: 120 }),
  lockStartedAt: timestamp('lock_started_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_site_automations_site_updated').on(table.siteId, table.updatedAt),
  index('idx_site_automations_status').on(table.status),
  index('idx_site_automations_next_run').on(table.nextRunAt),
  check('site_automations_status_check', sql`${table.status} in ('draft', 'active', 'paused')`),
  check('site_automations_last_run_status_check', sql`${table.lastRunStatus} is null or ${table.lastRunStatus} in ('running', 'success', 'partial', 'failed', 'noop')`),
])

export const siteAutomationRuns = pgTable('site_automation_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  automationId: uuid('automation_id').notNull().references(() => siteAutomations.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('running'),
  triggerType: varchar('trigger_type', { length: 20 }).notNull(),
  graphSnapshot: jsonb('graph_snapshot').notNull(),
  error: text('error'),
  durationMs: integer('duration_ms'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('idx_site_automation_runs_automation_started').on(table.automationId, table.startedAt),
  check('site_automation_runs_status_check', sql`${table.status} in ('running', 'success', 'partial', 'failed', 'noop')`),
  check('site_automation_runs_trigger_check', sql`${table.triggerType} in ('manual', 'schedule')`),
])

export const siteAutomationRunSteps = pgTable('site_automation_run_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').notNull().references(() => siteAutomationRuns.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 64 }).notNull(),
  nodeKind: varchar('node_kind', { length: 20 }).notNull(),
  nodeName: varchar('node_name', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  inputSummary: jsonb('input_summary').notNull().default({}),
  outputSummary: jsonb('output_summary').notNull().default({}),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
}, (table) => [
  uniqueIndex('idx_site_automation_run_steps_node_unique').on(table.runId, table.nodeId),
  index('idx_site_automation_run_steps_run_status').on(table.runId, table.status),
  check('site_automation_run_steps_kind_check', sql`${table.nodeKind} in ('time', 'scraper', 'router', 'agent', 'post', 'listing')`),
  check('site_automation_run_steps_status_check', sql`${table.status} in ('pending', 'running', 'success', 'failed', 'skipped')`),
])

export const siteAutomationSourceStates = pgTable('site_automation_source_states', {
  automationId: uuid('automation_id').notNull().references(() => siteAutomations.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 64 }).notNull(),
  url: text('url').notNull(),
  urlHash: varchar('url_hash', { length: 64 }).notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  lastChangedAt: timestamp('last_changed_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.automationId, table.nodeId, table.urlHash], name: 'site_automation_source_states_pkey' }),
  index('idx_site_automation_source_states_automation').on(table.automationId),
])

export const siteAutomationsRelations = relations(siteAutomations, ({ one, many }) => ({
  site: one(sites, { fields: [siteAutomations.siteId], references: [sites.id] }),
  runs: many(siteAutomationRuns),
  sourceStates: many(siteAutomationSourceStates),
}))

export const siteAutomationRunsRelations = relations(siteAutomationRuns, ({ one, many }) => ({
  automation: one(siteAutomations, { fields: [siteAutomationRuns.automationId], references: [siteAutomations.id] }),
  steps: many(siteAutomationRunSteps),
}))

export const siteAutomationRunStepsRelations = relations(siteAutomationRunSteps, ({ one }) => ({
  run: one(siteAutomationRuns, { fields: [siteAutomationRunSteps.runId], references: [siteAutomationRuns.id] }),
}))

export const siteAutomationSourceStatesRelations = relations(siteAutomationSourceStates, ({ one }) => ({
  automation: one(siteAutomations, { fields: [siteAutomationSourceStates.automationId], references: [siteAutomations.id] }),
}))
