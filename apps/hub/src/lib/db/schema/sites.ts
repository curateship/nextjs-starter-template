import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { authUsers } from './auth-users'

// SEO-related fields stored in site settings JSONB
export interface SiteSeoSettings {
  seo_site_description?: string        // Default meta description fallback
  seo_default_og_image?: string         // Default OG image URL
  seo_twitter_card_type?: 'summary' | 'summary_large_image'  // Twitter card type
  seo_twitter_handle?: string           // @handle for twitter:site
  seo_google_verification?: string      // google-site-verification value
  seo_canonical_domain?: 'custom' | 'subdomain'  // Which domain is canonical
  seo_org_name?: string                 // Organization name for structured data
  seo_org_logo?: string                 // Organization logo URL
  seo_org_social_links?: string[]       // Social profile URLs
}

// Full site settings shape (extends existing settings)
export interface SiteSettings extends SiteSeoSettings {
  favicon?: string
  font_family?: string
  secondary_font_family?: string
  default_theme?: string
  navigation?: Record<string, any>
  footer?: Record<string, any>
  quick_links?: Array<{
    id: string
    label: string
    href: string
    icon?: string
  }>
  enabled_features?: Record<string, boolean>
  feature_order?: string[]
  maintenance?: { enabled?: boolean }
  tracking_scripts?: string
  custom_analytics_enabled?: boolean
  [key: string]: any  // Allow other dynamic settings
}

export const sites = pgTable('sites', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  subdomain: varchar('subdomain', { length: 100 }).notNull().unique(),
  customDomain: varchar('custom_domain', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  isTemplate: boolean('is_template').notNull().default(false),
  settings: jsonb('settings').default({}).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_sites_user_id').on(table.userId),
  index('idx_sites_status').on(table.status),
  index('idx_sites_subdomain').on(table.subdomain),
  index('idx_sites_custom_domain').on(table.customDomain),
])

export const sitesRelations = relations(sites, ({ one }) => ({
  user: one(authUsers, {
    fields: [sites.userId],
    references: [authUsers.id],
  }),
}))
