import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import type { PhoneActionStatus, PhoneConnection } from "@/lib/phones/options"
import { promoProfileFolders, promoProfileLabels, promoProxies } from "@/server/browser/schema"
import { customShellUsers } from "@/server/schema"

/**
 * The phone farm's tables: the phones, the rack program at home that drives
 * them, and the actions Promo asks it to run. None of them names a network,
 * the same as the browser's tables. A Reddit account points at a phone from
 * `promo_accounts.phone_id`. The SQL is `drizzle/0114_promo_phones.sql`.
 */

/**
 * One rack program, paired once. Its key signs every message both ways and is
 * stored encrypted with the server's key. A disconnected rack keeps its row
 * and its key is refused from that moment.
 */
export const promoRacks = pgTable(
  "promo_racks",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull().default(""),
    keyEncrypted: text("key_encrypted").notNull(),
    /** "macOS 15.5" or "Linux", as the program said when it checked in. */
    platform: varchar("platform", { length: 40 }).notNull().default(""),
    version: varchar("version", { length: 40 }).notNull().default(""),
    /** What the last update did, in words. Empty when there is nothing to say. */
    updateNote: text("update_note").notNull().default(""),
    pairedAt: timestamp("paired_at", { withTimezone: true }).notNull().defaultNow(),
    seenAt: timestamp("seen_at", { withTimezone: true }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  },
  (table) => [index("ix_promo_racks_user").on(table.userId)]
)

/** A one-time pairing code, stored as a hash. Works once, for fifteen minutes. */
export const promoRackCodes = pgTable(
  "promo_rack_codes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("ux_promo_rack_codes_hash").on(table.codeHash)]
)

/** The random word each signed message carries once, so a copy sent again is refused. */
export const promoRackNonces = pgTable(
  "promo_rack_nonces",
  {
    rackId: varchar("rack_id", { length: 36 })
      .notNull()
      .references(() => promoRacks.id, { onDelete: "cascade" }),
    nonce: varchar("nonce", { length: 64 }).notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.rackId, table.nonce] }),
    index("ix_promo_rack_nonces_seen").on(table.seenAt),
  ]
)

/**
 * One Android phone on the rack. Whether it is connected is worked out from
 * `lastSeenAt` and `adbState`, which the rack writes on every check-in, so
 * there is no status column to fall out of step. `held` is a person taking it
 * out of use by hand.
 */
export const promoPhones = pgTable(
  "promo_phones",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    model: varchar("model", { length: 120 }).notNull().default(""),
    androidVersion: varchar("android_version", { length: 40 }).notNull().default(""),
    /** adb's serial number: how the rack's check-in finds this record. */
    serial: varchar("serial", { length: 120 }).notNull().default(""),
    simCarrier: varchar("sim_carrier", { length: 120 }).notNull().default(""),
    simNumber: varchar("sim_number", { length: 40 }).notNull().default(""),
    connection: varchar("connection", { length: 10 }).$type<PhoneConnection>().notNull().default("sim"),
    /** Only for Wi-Fi. Null on Wi-Fi means the house's own address. */
    proxyId: varchar("proxy_id", { length: 36 }).references(() => promoProxies.id, {
      onDelete: "set null",
    }),
    held: boolean("held").notNull().default(false),
    notes: text("notes").notNull().default(""),
    folderId: varchar("folder_id", { length: 36 }).references(() => promoProfileFolders.id, {
      onDelete: "set null",
    }),
    labelId: varchar("label_id", { length: 36 }).references(() => promoProfileLabels.id, {
      onDelete: "set null",
    }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** Typed once by a person. */
    shelfSlot: varchar("shelf_slot", { length: 20 }).notNull().default(""),
    /** Reported by the rack on every check-in, so moving the cable moves it. */
    usbPort: varchar("usb_port", { length: 120 }).notNull().default(""),
    rackId: varchar("rack_id", { length: 36 }).references(() => promoRacks.id, {
      onDelete: "set null",
    }),
    /** 'device', 'unauthorized', 'gone', or empty before the first check-in. */
    adbState: varchar("adb_state", { length: 20 }).notNull().default(""),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /**
     * The phone's own time zone, read by the rack on every check-in, or empty
     * before the first. Added by `drizzle/0115_promo_phone_jobs.sql`.
     */
    timeZone: varchar("time_zone", { length: 64 }).notNull().default(""),
    /**
     * While a person controls the phone from its screen window, its jobs
     * wait. Each tap moves this fifteen minutes on and closing the window
     * clears it. Added by `drizzle/0115_promo_phone_jobs.sql`.
     */
    controlUntil: timestamp("control_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_promo_phones_user").on(table.userId),
    uniqueIndex("ux_promo_phones_user_serial")
      .on(table.userId, table.serial)
      .where(sql`${table.serial} <> ''`),
  ]
)

/** One named action for one phone, asked for by Promo and run by the rack. */
export const promoPhoneActions = pgTable(
  "promo_phone_actions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    rackId: varchar("rack_id", { length: 36 })
      .notNull()
      .references(() => promoRacks.id, { onDelete: "cascade" }),
    phoneId: varchar("phone_id", { length: 36 })
      .notNull()
      .references(() => promoPhones.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 60 }).notNull(),
    args: jsonb("args").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 20 }).$type<PhoneActionStatus>().notNull().default("queued"),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    error: text("error").notNull().default(""),
    /** How long the rack has once it starts, in seconds. Added by 0115. */
    timeoutSeconds: integer("timeout_seconds").notNull().default(300),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("ix_promo_phone_actions_rack").on(table.rackId, table.status, table.createdAt),
    index("ix_promo_phone_actions_phone").on(table.phoneId, table.createdAt.desc()),
  ]
)

/** A picture an action sent back, JPEG in base64, shrunk by the rack first. */
export const promoPhoneScreenshots = pgTable(
  "promo_phone_screenshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    actionId: varchar("action_id", { length: 36 })
      .notNull()
      .references(() => promoPhoneActions.id, { onDelete: "cascade" }),
    imageBase64: text("image_base64").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_promo_phone_screenshots_action").on(table.actionId)]
)

/**
 * The rack's settings, one row, "default", like the browser settings: how
 * many phones work at once, how many days pictures are kept, and the pause.
 * The SQL is `drizzle/0115_promo_phone_jobs.sql`.
 */
export const promoPhoneSettings = pgTable("promo_phone_settings", {
  id: varchar("id", { length: 20 }).primaryKey(),
  maxWorking: integer("max_working").notNull().default(5),
  screenshotDays: integer("screenshot_days").notNull().default(7),
  /** When the whole rack was paused, or null when it runs. */
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  /** Who paused it, so the bell rings for them. */
  pausedBy: varchar("paused_by", { length: 36 }).references(() => customShellUsers.id, { onDelete: "set null" }),
  /** The bell notice saying the rack is paused, removed when it resumes. */
  pauseNoticeId: varchar("pause_notice_id", { length: 36 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
