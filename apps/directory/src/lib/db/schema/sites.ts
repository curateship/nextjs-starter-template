import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { relations } from 'drizzle-orm'
import { authUsers } from './auth-users'
import type { AdminSidebarSettings } from '@/lib/utils/admin-sidebar'

// SEO-related fields stored in site settings JSONB
export interface SiteSeoSettings {
  site_title?: string                   // Search/display title for the site
  seo_home_title?: string               // Home page SEO title
  seo_home_description?: string         // Home page meta description
  seo_pages_title_template?: string     // Page SEO title template
  seo_pages_description_template?: string // Page meta description template
  seo_posts_title_template?: string     // Post SEO title template
  seo_posts_description_template?: string // Post meta description template
  seo_products_title_template?: string  // Product page SEO title template
  seo_products_description_template?: string // Product page meta description template
  seo_categories_title_template?: string // Category SEO title template
  seo_categories_description_template?: string // Category meta description template
  seo_directories_title_template?: string // Directory SEO title template
  seo_directories_description_template?: string // Directory meta description template
  seo_events_title_template?: string    // Event SEO title template
  seo_events_description_template?: string // Event meta description template
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
  site_tag?: string
  favicon?: string
  font_family?: string
  secondary_font_family?: string
  default_theme?: string
  navigation?: Record<string, any>
  footer?: Record<string, any>
  admin_sidebar?: AdminSidebarSettings
  breadcrumbs?: Record<string, boolean>
  maintenance?: { enabled?: boolean }
  directory_save_default_collections?: Array<{
    key: string
    label: string
  }>
  newsletter_drip_defaults?: Record<string, any>
  newsletter_cold_threshold_emails?: number
  tracking_scripts?: string
  custom_analytics_enabled?: boolean
  listing_widgets_enabled?: boolean   // Embeddable listing widgets; enabled unless explicitly false
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
  uniqueIndex('idx_sites_custom_domain_unique').on(table.customDomain).where(sql`${table.customDomain} is not null and ${table.customDomain} <> ''`),
])

export const sitesRelations = relations(sites, ({ one }) => ({
  user: one(authUsers, {
    fields: [sites.userId],
    references: [authUsers.id],
  }),
}))
