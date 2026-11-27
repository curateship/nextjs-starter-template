import { pgTable, timestamp, varchar } from "drizzle-orm/pg-core"

import { customShellUsers } from "@/server/schema"

/**
 * Content's own tables (`drizzle/0257_content_app.sql`). Everything else
 * Content keeps is in Video's, Promo's and Viral's tables, under their own
 * names (`workspace/docs/content-app.md`).
 */

/** The sample project is made once per person (`sample.ts`). */
export const contentSampleMade = pgTable("content_sample_made", {
  ownerId: varchar("owner_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  madeAt: timestamp("made_at", { withTimezone: true }).notNull(),
})

/** The menus Content's left menu was written into, once each (`navigation.ts`). */
export const contentNavigationAdded = pgTable("content_navigation_added", {
  scope: varchar("scope", { length: 120 }).primaryKey(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
})
