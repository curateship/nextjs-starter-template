import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import type { PhoneActionStatus, PhoneConnection, PhoneEventKind, RolloutStatus, TrackedApp } from "@/lib/phones/options"
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
    /** 'device', 'unauthorized', 'restarting' (the rack restarting it), 'gone', or empty before the first check-in. */
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
    /**
     * When `adbState` last changed, so a phone offline for five minutes can
     * be told from one that blinked. The columns from here to `apps` are what
     * the rack last read off the phone, about once a minute. Added by
     * `drizzle/0116_promo_phone_health.sql`.
     */
    stateSince: timestamp("state_since", { withTimezone: true }),
    batteryPercent: integer("battery_percent"),
    temperatureC: real("temperature_c"),
    storageUsedPercent: integer("storage_used_percent"),
    /** Android's word for the SIM's service: 'in_service', 'out_of_service', 'emergency_only', 'power_off', or empty. */
    signal: varchar("signal", { length: 20 }).notNull().default(""),
    /** When the SIM last lost its service, or null while it has it. */
    signalLostAt: timestamp("signal_lost_at", { withTimezone: true }),
    /** Seconds since the phone started. A smaller number than last time means it restarted. */
    upSeconds: integer("up_seconds"),
    vitalsAt: timestamp("vitals_at", { withTimezone: true }),
    /** Each tracked app's version, such as `{ "reddit": "2025.40.0" }`. An app not installed is left out. */
    apps: jsonb("apps").$type<Partial<Record<TrackedApp, string>>>().notNull().default({}),
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
    /** What the rack did about a freeze: 'app' closed and reopened it, 'phone' restarted it. Added by 0116. */
    recovered: varchar("recovered", { length: 10 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("ix_promo_phone_actions_rack").on(table.rackId, table.status, table.createdAt),
    index("ix_promo_phone_actions_phone").on(table.phoneId, table.createdAt.desc()),
  ]
)

/**
 * A picture of one step of an action, shrunk by the rack and kept encrypted
 * in R2 under `objectKey`, like a profile's backup. `imageBase64` is no
 * longer written or read; it stays because stored columns are never dropped.
 */
export const promoPhoneScreenshots = pgTable(
  "promo_phone_screenshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    actionId: varchar("action_id", { length: 36 })
      .notNull()
      .references(() => promoPhoneActions.id, { onDelete: "cascade" }),
    imageBase64: text("image_base64").notNull().default(""),
    /** What the step was, such as "Opened About phone". */
    step: varchar("step", { length: 200 }).notNull().default(""),
    position: integer("position").notNull().default(0),
    objectKey: varchar("object_key", { length: 300 }).notNull().default(""),
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
  /**
   * The spare phone the daily self-test runs on, signed into a test account
   * and never given a real one (Tyler, 14 Oct 2026). Added by 0116.
   */
  testPhoneId: varchar("test_phone_id", { length: 36 }).references(() => promoPhones.id, { onDelete: "set null" }),
  /** When the self-test was last asked for. */
  selfTestAt: timestamp("self_test_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/** One line in a phone's history. The SQL is `drizzle/0116_promo_phone_health.sql`. */
export const promoPhoneEvents = pgTable(
  "promo_phone_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    phoneId: varchar("phone_id", { length: 36 })
      .notNull()
      .references(() => promoPhones.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 30 }).$type<PhoneEventKind>().notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_promo_phone_events_phone").on(table.phoneId, table.createdAt.desc())]
)

/** Battery and heat, every ten minutes and at every hot reading, for the four-week chart. */
export const promoPhoneReadings = pgTable(
  "promo_phone_readings",
  {
    phoneId: varchar("phone_id", { length: 36 })
      .notNull()
      .references(() => promoPhones.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull(),
    batteryPercent: integer("battery_percent"),
    temperatureC: real("temperature_c"),
  },
  (table) => [primaryKey({ columns: [table.phoneId, table.at] })]
)

/** The daily self-test's answer for each action. A broken one is refused until it passes. */
export const promoPhoneActionChecks = pgTable(
  "promo_phone_action_checks",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 60 }).notNull(),
    passed: boolean("passed").notNull(),
    /** The step it could not get past, or empty when it passed. */
    step: varchar("step", { length: 200 }).notNull().default(""),
    error: text("error").notNull().default(""),
    /** The self-test run, whose pictures show where it stopped. */
    phoneActionId: varchar("phone_action_id", { length: 36 }).references(() => promoPhoneActions.id, {
      onDelete: "set null",
    }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.action] })]
)

/** An app update going round the rack, one phone first. */
export const promoAppRollouts = pgTable(
  "promo_app_rollouts",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    app: varchar("app", { length: 20 }).$type<TrackedApp>().notNull(),
    status: varchar("status", { length: 20 }).$type<RolloutStatus>().notNull(),
    fromVersion: varchar("from_version", { length: 60 }).notNull().default(""),
    toVersion: varchar("to_version", { length: 60 }).notNull().default(""),
    /** Why it failed, in words, or empty. */
    note: text("note").notNull().default(""),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.app] })]
)
