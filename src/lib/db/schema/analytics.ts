import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { sites } from './sites'

export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull(),
  visitorHash: text('visitor_hash'),
  eventType: text('event_type').notNull(),
  pagePath: text('page_path'),
  referrer: text('referrer'),
  referrerDomain: text('referrer_domain'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  deviceType: text('device_type'),
  browser: text('browser'),
  country: text('country'),
  eventData: jsonb('event_data').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_analytics_events_site_created').on(table.siteId, table.createdAt),
  index('idx_analytics_events_site_type_created').on(table.siteId, table.eventType, table.createdAt),
  index('idx_analytics_events_site_session').on(table.siteId, table.sessionId),
])

export const analyticsSessions = pgTable('analytics_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull(),
  visitorHash: text('visitor_hash'),
  entryPage: text('entry_page'),
  exitPage: text('exit_page'),
  pageCount: integer('page_count').default(1),
  durationSeconds: integer('duration_seconds').default(0),
  referrerDomain: text('referrer_domain'),
  utmSource: text('utm_source'),
  deviceType: text('device_type'),
  isBounce: boolean('is_bounce').default(true),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (table) => [
  index('idx_analytics_sessions_site_started').on(table.siteId, table.startedAt),
  index('idx_analytics_sessions_site_referrer').on(table.siteId, table.referrerDomain),
])
