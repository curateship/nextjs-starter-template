import { jsonb, pgTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/pg-core"

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

/**
 * The member's Google Calendar, connected one way: Date writes an event for
 * each agreed date and never reads the calendar. The SQL is
 * `drizzle/0100_date_chats.sql`.
 */
export const dateGoogleCalendars = pgTable(
  "date_google_calendars",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull().default(""),
    /** Encrypted with the server's key, through `encryptSecret`. */
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    /** Why the last write to Google failed, in words, or empty. */
    lastError: text("last_error").notNull().default(""),
  },
  (table) => [primaryKey({ columns: [table.userId, table.workspaceId] })]
)
