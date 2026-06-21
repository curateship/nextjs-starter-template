import { pgTable, uuid, varchar, text, integer, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const cronJobs = pgTable('cron_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  endpoint: varchar('endpoint', { length: 500 }).notNull(),
  schedule: varchar('schedule', { length: 100 }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_cron_jobs_endpoint_unique').on(table.endpoint),
  index('idx_cron_jobs_enabled').on(table.enabled),
  index('idx_cron_jobs_next_run').on(table.nextRunAt),
])

export const cronJobRuns = pgTable('cron_job_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id').notNull().references(() => cronJobs.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull(),
  durationMs: integer('duration_ms'),
  response: text('response'),
  httpStatus: integer('http_status'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_cron_job_runs_job').on(table.jobId),
  index('idx_cron_job_runs_started').on(table.startedAt),
])

export const cronJobsRelations = relations(cronJobs, ({ many }) => ({
  runs: many(cronJobRuns),
}))

export const cronJobRunsRelations = relations(cronJobRuns, ({ one }) => ({
  job: one(cronJobs, {
    fields: [cronJobRuns.jobId],
    references: [cronJobs.id],
  }),
}))
