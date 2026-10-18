import { jsonb, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core"

import type { DatingSettings } from "@/lib/dating/settings"
import { customShellUsers, customShellWorkspaces } from "@/server/schema"

/**
 * The member's Dating settings, one row per member per site. The values are
 * one JSON object read through `datingSettingsShape`, so a value not saved yet
 * takes its default. The SQL is `drizzle/0098_date_settings.sql`.
 */
export const dateSettings = pgTable(
  "date_settings",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    values: jsonb("values").$type<Partial<DatingSettings>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.workspaceId] })]
)
