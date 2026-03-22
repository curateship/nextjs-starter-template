import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { sites } from './sites'
import { newsletters } from './newsletters'

export const newsletterSkills = pgTable('newsletter_skills', {
  id: uuid('id').defaultRandom().primaryKey(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  prompt: text('prompt').notNull(),
  quantity: integer('quantity').notNull().default(1),
  referenceText: text('reference_text'),
  settings: jsonb('settings').default({}),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_newsletter_skills_site').on(table.siteId),
])

export const newsletterSkillOutputs = pgTable('newsletter_skill_outputs', {
  id: uuid('id').defaultRandom().primaryKey(),
  skillId: uuid('skill_id').notNull().references(() => newsletterSkills.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  contentBlocks: jsonb('content_blocks').default({}),
  status: varchar('status', { length: 20 }).default('pending'),
  newsletterId: uuid('newsletter_id').references(() => newsletters.id),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_newsletter_skill_outputs_skill').on(table.skillId),
  index('idx_newsletter_skill_outputs_site').on(table.siteId),
  index('idx_newsletter_skill_outputs_status').on(table.skillId, table.status),
])

export const newsletterSkillsRelations = relations(newsletterSkills, ({ one, many }) => ({
  site: one(sites, {
    fields: [newsletterSkills.siteId],
    references: [sites.id],
  }),
  outputs: many(newsletterSkillOutputs),
}))

export const newsletterSkillOutputsRelations = relations(newsletterSkillOutputs, ({ one }) => ({
  skill: one(newsletterSkills, {
    fields: [newsletterSkillOutputs.skillId],
    references: [newsletterSkills.id],
  }),
  site: one(sites, {
    fields: [newsletterSkillOutputs.siteId],
    references: [sites.id],
  }),
  newsletter: one(newsletters, {
    fields: [newsletterSkillOutputs.newsletterId],
    references: [newsletters.id],
  }),
}))
