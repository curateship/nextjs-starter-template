import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { authUsers } from './auth-users'

export const seoLaunchCodes = pgTable(
  'seo_launch_codes',
  {
    code: text('code').primaryKey(),
    hubUserId: text('hub_user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull(),
    seoAccess: boolean('seo_access').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    hubUserIdIdx: index('seo_launch_codes_hub_user_id_idx').on(table.hubUserId),
    expiresAtIdx: index('seo_launch_codes_expires_at_idx').on(table.expiresAt),
  })
)
