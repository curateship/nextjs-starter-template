import { index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import type { DatingApp } from "@/lib/dating/options"
import type { DatingSettings } from "@/lib/dating/settings"
import { datePhones } from "@/server/phone/schema"
import { customShellUsers, customShellWorkspaces } from "@/server/schema"

/**
 * One profile: one dating app's account, run by one member on one site
 * (task "features/06-profiles", Tyler, 20 Oct 2026). Its cards, chats, walks,
 * own profile, settings, Google Calendar and AI spend are its own. It is
 * called an account here because `date_profiles` already means a card; on
 * screen it is always "profile". The phone is null until one is paired for
 * it, and a phone carries at most one profile of each app. The SQL is
 * `drizzle/0108_date_profiles.sql`.
 */
export const dateAccounts = pgTable(
  "date_accounts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    app: varchar("app", { length: 10 }).$type<DatingApp>().notNull().default("tinder"),
    name: varchar("name", { length: 80 }).notNull(),
    phoneId: varchar("phone_id", { length: 36 }).references(() => datePhones.id, { onDelete: "set null" }),
    /** Pause: no swipes, no replies and no AI calls until Resume. */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_date_accounts_user").on(table.userId, table.workspaceId, table.createdAt),
    uniqueIndex("ux_date_accounts_phone_app").on(table.phoneId, table.app).where(sql`${table.phoneId} is not null`),
  ]
)

/** The profile the member last picked on the Dating dashboard, one per member per site. */
export const dateAccountPicks = pgTable(
  "date_account_picks",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => dateAccounts.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.workspaceId] })]
)

/**
 * A profile's Dating settings, one row per profile. The values are one JSON
 * object read through `datingSettingsShape`, so a value not saved yet takes
 * its default. The SQL is `drizzle/0098_date_settings.sql`, keyed by profile
 * since `drizzle/0108_date_profiles.sql`.
 */
export const dateSettings = pgTable(
  "date_settings",
  {
    accountId: varchar("account_id", { length: 36 })
      .primaryKey()
      .references(() => dateAccounts.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    values: jsonb("values").$type<Partial<DatingSettings>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
)

/**
 * A profile's Google Calendar, connected one way: Date writes an event for
 * each agreed date and never reads the calendar. The SQL is
 * `drizzle/0100_date_chats.sql`, keyed by profile since
 * `drizzle/0108_date_profiles.sql`.
 */
export const dateGoogleCalendars = pgTable(
  "date_google_calendars",
  {
    accountId: varchar("account_id", { length: 36 })
      .primaryKey()
      .references(() => dateAccounts.id, { onDelete: "cascade" }),
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
  }
)
