import { pgTable, timestamp, varchar } from "drizzle-orm/pg-core"

/**
 * Which left menus have been given Personal's links to the other apps
 * (`drizzle/0094_personal_navigation_added.sql`). See `navigation.ts`.
 */
export const personalNavigationAdded = pgTable("personal_navigation_added", {
  scope: varchar("scope", { length: 80 }).primaryKey(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
})
