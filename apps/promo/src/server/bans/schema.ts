import { index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import type { AccountEventKind, AppealAnswer, BanKind, TenancyEnd } from "@/lib/bans/options"
import { promoProfiles, promoProxies } from "@/server/browser/schema"
import { promoPhones } from "@/server/phones/schema"
import { customShellUsers } from "@/server/schema"
import { promoAccounts, promoProjects } from "@/server/social/schema"

/**
 * The Bans task's tables (workspace/tasks/Bans/01-ban-features.md). The SQL
 * is `drizzle/0133_promo_bans.sql`.
 */

/**
 * One ban, written once when an account is first stopped (part 1). Where it
 * ran is copied at that moment: the phone, the browser profile, the proxy
 * and the SIM, so a later move or a new proxy never changes what the ban was
 * on (part 13).
 */
export const promoBans = pgTable(
  "promo_bans",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 }).references(() => promoAccounts.id, { onDelete: "set null" }),
    app: varchar("app", { length: 20 }).notNull(),
    handle: varchar("handle", { length: 120 }).notNull().default(""),
    kind: varchar("kind", { length: 20 }).$type<BanKind>().notNull(),
    words: text("words").notNull().default(""),
    phoneId: varchar("phone_id", { length: 36 }).references(() => promoPhones.id, { onDelete: "set null" }),
    profileId: varchar("profile_id", { length: 36 }).references(() => promoProfiles.id, { onDelete: "set null" }),
    proxyId: varchar("proxy_id", { length: 36 }).references(() => promoProxies.id, { onDelete: "set null" }),
    simNumber: varchar("sim_number", { length: 40 }).notNull().default(""),
    simCarrier: varchar("sim_carrier", { length: 120 }).notNull().default(""),
    projectId: varchar("project_id", { length: 36 }).references(() => promoProjects.id, { onDelete: "set null" }),
    accountBornAt: timestamp("account_born_at", { withTimezone: true }),
    postsWeek: integer("posts_week").notNull().default(0),
    actionId: varchar("action_id", { length: 36 }),
    pictureKey: text("picture_key").notNull().default(""),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    letRunAt: timestamp("let_run_at", { withTimezone: true }),
    cleanedUpAt: timestamp("cleaned_up_at", { withTimezone: true }),
    appealedAt: timestamp("appealed_at", { withTimezone: true }),
    appealNote: text("appeal_note").notNull().default(""),
    appealAnswer: varchar("appeal_answer", { length: 10 }).$type<AppealAnswer | "">().notNull().default(""),
    appealAnsweredAt: timestamp("appeal_answered_at", { withTimezone: true }),
    appealRemindedAt: timestamp("appeal_reminded_at", { withTimezone: true }),
    lookedAt: timestamp("looked_at", { withTimezone: true }),
    looksBackAt: timestamp("looks_back_at", { withTimezone: true }),
  },
  (table) => [
    index("ix_promo_bans_user").on(table.userId, table.at.desc()),
    index("ix_promo_bans_account").on(table.accountId, table.at.desc()),
    index("ix_promo_bans_phone").on(table.phoneId, table.app),
    index("ix_promo_bans_proxy").on(table.proxyId, table.app),
  ]
)

/** Every account a phone has held, from when it arrived to when it left and how (part 2). */
export const promoPhoneTenancies = pgTable(
  "promo_phone_tenancies",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    phoneId: varchar("phone_id", { length: 36 })
      .notNull()
      .references(() => promoPhones.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 }).references(() => promoAccounts.id, { onDelete: "set null" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    handle: varchar("handle", { length: 120 }).notNull().default(""),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    leftHow: varchar("left_how", { length: 10 }).$type<TenancyEnd | "">().notNull().default(""),
  },
  (table) => [
    index("ix_promo_phone_tenancies_phone").on(table.phoneId, table.arrivedAt.desc()),
    index("ix_promo_phone_tenancies_account").on(table.accountId).where(sql`${table.leftAt} IS NULL`),
  ]
)

/**
 * A screen Promo did not know (part 9): asked about once, then learned as a
 * ban line the rack adds to its own list, or a harmless line it skips.
 */
export const promoBanPhrases = pgTable(
  "promo_ban_phrases",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    app: varchar("app", { length: 20 }).notNull(),
    line: text("line").notNull(),
    verdict: varchar("verdict", { length: 10 }).$type<"" | "ban" | "harmless">().notNull().default(""),
    accountId: varchar("account_id", { length: 36 }).references(() => promoAccounts.id, { onDelete: "set null" }),
    phoneId: varchar("phone_id", { length: 36 }).references(() => promoPhones.id, { onDelete: "set null" }),
    actionId: varchar("action_id", { length: 36 }),
    words: text("words").notNull().default(""),
    pictureKey: text("picture_key").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("ux_promo_ban_phrases_line").on(table.userId, table.app, table.line)]
)

/** Each account's own history (part 14). */
export const promoAccountEvents = pgTable(
  "promo_account_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => promoAccounts.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 20 }).$type<AccountEventKind>().notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_promo_account_events_account").on(table.accountId, table.createdAt.desc())]
)

/** The app-wide brake (part 11), one row per app while it is on. */
export const promoAppBrakes = pgTable(
  "promo_app_brakes",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    app: varchar("app", { length: 20 }).notNull(),
    brakedAt: timestamp("braked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.app] })]
)
