import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, index, date, uniqueIndex } from 'drizzle-orm/pg-core'
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

export const analyticsDailyEvents = pgTable('analytics_daily_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  contentKey: text('content_key').notNull(),
  contentType: text('content_type').notNull(),
  contentId: text('content_id'),
  contentSlug: text('content_slug'),
  pagePath: text('page_path'),
  eventType: text('event_type').notNull(),
  count: integer('count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_analytics_daily_events_unique').on(table.siteId, table.day, table.contentKey, table.eventType),
  index('idx_analytics_daily_events_site_day').on(table.siteId, table.day),
  index('idx_analytics_daily_events_content').on(table.siteId, table.contentType, table.contentId, table.day),
  index('idx_analytics_daily_events_path').on(table.siteId, table.pagePath, table.day),
])

export const analyticsDailyVisitors = pgTable('analytics_daily_visitors', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  day: date('day').notNull(),
  contentKey: text('content_key').notNull(),
  contentType: text('content_type').notNull(),
  contentId: text('content_id'),
  contentSlug: text('content_slug'),
  pagePath: text('page_path'),
  visitorHash: text('visitor_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_analytics_daily_visitors_unique').on(table.siteId, table.day, table.contentKey, table.visitorHash),
  index('idx_analytics_daily_visitors_site_day').on(table.siteId, table.day),
  index('idx_analytics_daily_visitors_content').on(table.siteId, table.contentType, table.contentId, table.day),
])
