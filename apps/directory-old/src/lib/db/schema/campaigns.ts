import { relations } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import type { CampaignContent, CampaignTargeting, CampaignTrigger } from '@/lib/campaigns/campaigns'
import { sites } from './sites'

export const campaigns = pgTable('campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  content: jsonb('content').$type<CampaignContent>().notNull(),
  targeting: jsonb('targeting').$type<CampaignTargeting>().notNull(),
  trigger: jsonb('trigger').$type<CampaignTrigger>().notNull(),
  frequency: varchar('frequency', { length: 30 }).notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  views: integer('views').notNull().default(0),
  dismissals: integer('dismissals').notNull().default(0),
  submissions: integer('submissions').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('campaigns_type_check', sql`${table.type} in ('bar', 'popup')`),
  check('campaigns_status_check', sql`${table.status} in ('draft', 'active')`),
  check('campaigns_frequency_check', sql`${table.frequency} in ('once_per_visitor', 'once_per_session', 'every_visit')`),
  check('campaigns_schedule_check', sql`${table.endsAt} is null or ${table.startsAt} is null or ${table.endsAt} > ${table.startsAt}`),
  index('idx_campaigns_site_status').on(table.siteId, table.status),
  index('idx_campaigns_site_created').on(table.siteId, table.createdAt),
])

export const campaignsRelations = relations(campaigns, ({ one }) => ({
  site: one(sites, { fields: [campaigns.siteId], references: [sites.id] }),
}))
