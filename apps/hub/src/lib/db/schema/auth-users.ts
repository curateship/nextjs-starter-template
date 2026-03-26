import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core'

export const authUsers = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
  role: text('role').notNull().default('end_user'),
  banned: boolean('banned').notNull().default(false),
  banReason: text('banReason'),
  banExpires: timestamp('banExpires', { withTimezone: true }),
  displayName: text('displayName'),
})
