import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core"

import type { PhoneActionKind, PhoneActionStatus, StopReason } from "@/lib/dating/options"
import { customShellUsers, customShellWorkspaces } from "@/server/schema"

/**
 * The phone link's tables: the member's Android phone, the one-time codes that
 * pair it, the random words its signed messages carry once, the plain actions
 * the server asks it to run, and the pictures kept from them. The SQL is
 * `drizzle/0096_date_phones.sql`. Stored fields are never renamed.
 */

/**
 * One Android phone running the Date app, owned by one member. Whether it is
 * here is worked out from `lastSeenAt`, which every check-in writes, so there
 * is no status column to fall out of step. A phone with no key is unpaired.
 */
export const datePhones = pgTable(
  "date_phones",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    model: varchar("model", { length: 120 }).notNull().default(""),
    androidVersion: varchar("android_version", { length: 40 }).notNull().default(""),
    appVersion: varchar("app_version", { length: 40 }).notNull().default(""),
    /** The key both sides sign with, encrypted with the server's key. Null once unpaired. */
    keyEncrypted: text("key_encrypted"),
    pairedAt: timestamp("paired_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    batteryPercent: integer("battery_percent"),
    /** The phone's own time zone, such as "America/Toronto", or empty before the first check-in. */
    timeZone: varchar("time_zone", { length: 64 }).notNull().default(""),
    /** Tinder's version on the phone, or empty when it is not installed. */
    tinderVersion: varchar("tinder_version", { length: 60 }).notNull().default(""),
    tinderInFront: boolean("tinder_in_front").notNull().default(false),
    /** The "Date is in control" switch on the Phone screen. Off, the phone is handed nothing. */
    inControl: boolean("in_control").notNull().default(true),
    /** The same switch on the phone itself, as it last reported. */
    phoneSwitchOn: boolean("phone_switch_on").notNull().default(true),
    /** Start and Stop on the dashboard: the AI swiping and drafting with the phone in a pocket. */
    running: boolean("running").notNull().default(false),
    runningSince: timestamp("running_since", { withTimezone: true }),
    /** Why the loop last ended, in words, and when. Empty while it runs or before it ever has. */
    stopWhy: text("stop_why").notNull().default(""),
    stopWhyAt: timestamp("stop_why_at", { withTimezone: true }),
    /** A Tinder screen that stops everything until Resume. Null while nothing is stopping it. */
    stoppedReason: varchar("stopped_reason", { length: 40 }).$type<StopReason>(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    /** The words on the screen that stopped it. */
    stoppedWords: text("stopped_words").notNull().default(""),
    stoppedPictureId: varchar("stopped_picture_id", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_date_phones_user").on(table.userId, table.workspaceId)]
)

/**
 * A six-digit code shown once on the Phone screen. Only its hash is kept. It
 * works once, for ten minutes, and pairs the phone named here, or a new phone
 * when none is named.
 */
export const datePhonePairCodes = pgTable(
  "date_phone_pair_codes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    phoneId: varchar("phone_id", { length: 36 }).references(() => datePhones.id, { onDelete: "cascade" }),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ix_date_phone_pair_codes_hash").on(table.codeHash)]
)

/** The random word each signed message carries once, so a copy sent again is refused. */
export const datePhoneNonces = pgTable(
  "date_phone_nonces",
  {
    phoneId: varchar("phone_id", { length: 36 })
      .notNull()
      .references(() => datePhones.id, { onDelete: "cascade" }),
    nonce: varchar("nonce", { length: 64 }).notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.phoneId, table.nonce] }), index("ix_date_phone_nonces_seen").on(table.seenAt)]
)

/**
 * One plain action for one phone. A walk writes these one step at a time and
 * waits on each; the Phone screen's picture button writes one on its own.
 *
 * `screenshot` holds the phone's picture of the screen as it came in, only
 * until whoever asked has used it. Kept pictures go to R2 and are listed in
 * `pictureIds`.
 */
export const datePhoneActions = pgTable(
  "date_phone_actions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    phoneId: varchar("phone_id", { length: 36 })
      .notNull()
      .references(() => datePhones.id, { onDelete: "cascade" }),
    /** The walk this step belongs to, or null for an action asked for on its own. */
    walkId: varchar("walk_id", { length: 36 }),
    kind: varchar("kind", { length: 30 }).$type<PhoneActionKind>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 20 }).$type<PhoneActionStatus>().notNull().default("waiting"),
    answer: jsonb("answer").$type<Record<string, unknown> | null>(),
    error: text("error").notNull().default(""),
    screenshot: text("screenshot"),
    pictureIds: jsonb("picture_ids").$type<string[]>().notNull().default([]),
    timeLimitSeconds: integer("time_limit_seconds").notNull().default(30),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("ix_date_phone_actions_phone").on(table.phoneId, table.status, table.createdAt),
    index("ix_date_phone_actions_walk").on(table.walkId),
  ]
)

/**
 * A picture kept from the phone: a step's screenshot, a photo cut from a
 * card, or the screen that stopped everything. Each is encrypted with the
 * server's key and kept privately in R2 under `objectKey`, the way Promo keeps
 * its step pictures, because these are other people's photos and private
 * chats. The same bytes are kept once per member (`sha256`).
 *
 * A sample picture has no object in R2: `samplePath` is a drawing under
 * `public/sample/dating/`.
 */
export const datePictures = pgTable(
  "date_pictures",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** 'step', 'photo', 'stop' or 'sample'. */
    kind: varchar("kind", { length: 10 }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    objectKey: varchar("object_key", { length: 300 }).notNull().default(""),
    samplePath: varchar("sample_path", { length: 200 }).notNull().default(""),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_date_pictures_user_sha").on(table.userId, table.sha256),
    index("ix_date_pictures_kind_created").on(table.kind, table.createdAt),
  ]
)
