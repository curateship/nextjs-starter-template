import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import type { DatingApp, StopReason } from "@/lib/dating/options"
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
    /**
     * The swipe loop's state, the profile's own so two profiles share one
     * phone (`drizzle/0112_date_loop_per_profile.sql`, task "facebook/01"
     * part 2). Start and Stop on the dashboard: the AI swiping and drafting
     * with the phone in a pocket.
     */
    running: boolean("running").notNull().default(false),
    runningSince: timestamp("running_since", { withTimezone: true }),
    /** Why the loop last ended, in words, and when. Empty while it runs or before it ever has. */
    stopWhy: text("stop_why").notNull().default(""),
    stopWhyAt: timestamp("stop_why_at", { withTimezone: true }),
    /** Who started the loop running now: the member's Start, or the swiping schedule. */
    startedBy: varchar("started_by", { length: 10 }).$type<"member" | "schedule">(),
    /**
     * The swiping window, by the phone-clock day it opened, that the schedule
     * has already started or that Stop held. The schedule starts the loop once a
     * window, and again in it only after a limit's time has passed.
     */
    scheduleDay: varchar("schedule_day", { length: 10 }).notNull().default(""),
    /** A limit ended the loop and allows it again at this moment. The schedule may start it again then, inside its window. */
    resumeAt: timestamp("resume_at", { withTimezone: true }),
    /** The app's distance and ages need setting from Date's: a setting changed, or Resume was pressed. */
    discoveryOwed: boolean("discovery_owed").notNull().default(true),
    /** A screen of the app's that stops this profile until Resume. Null while nothing is stopping it. */
    stoppedReason: varchar("stopped_reason", { length: 40 }).$type<StopReason>(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    /** The words on the screen that stopped it. */
    stoppedWords: text("stopped_words").notNull().default(""),
    stoppedPictureId: varchar("stopped_picture_id", { length: 36 }),
    /**
     * Facebook Dating's own break, as the phone last read it back: on, off,
     * or null before it ever read it (`drizzle/0123_date_app_break.sql`,
     * part 22). Pause turns it on and Resume turns it off.
     */
    appBreak: boolean("app_break"),
    appBreakAt: timestamp("app_break_at", { withTimezone: true }),
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
