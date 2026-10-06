import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import {
  type ProxyKind,
  type ProxyProtocol,
  type ProfileEventKind,
  type ProfileIdentity,
  type ProxyTestResult,
  type SiteCheckResult,
  type SessionEndedBy,
  type SessionStatus,
} from "@/lib/social/options"
import { customShellUsers } from "@/server/schema"

/**
 * The isolated browser's tables: the proxies, the browser profiles, and the
 * browsers open right now. None of them names a network. A Reddit account
 * points at a profile from `promo_accounts`, and an Instagram account will do
 * the same, so nothing here changes when a network is added.
 *
 * The SQL is `drizzle/0091_promo_reddit.sql` for the proxies and the sessions,
 * `drizzle/0094_promo_browser_profiles.sql` for the profiles and the columns
 * that tie the three together, and
 * `drizzle/0095_promo_proxy_and_profile_dashboards.sql` for what the two
 * dashboards added.
 */

/** A proxy a browser profile routes through. */
export const promoProxies = pgTable(
  "promo_proxies",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull().default(""),
    /** 'residential', 'mobile' or 'datacenter'. */
    kind: varchar("kind", { length: 20 })
      .$type<ProxyKind>()
      .notNull()
      .default("residential"),
    /** 'http', 'https' or 'socks5'. */
    protocol: varchar("protocol", { length: 20 })
      .$type<ProxyProtocol>()
      .notNull()
      .default("http"),
    host: varchar("host", { length: 255 }).notNull(),
    port: integer("port").notNull(),
    username: varchar("username", { length: 255 }).notNull().default(""),
    /**
     * AES-256-GCM through the shell's own `encryptSecret`, as
     * `iv:authTag:ciphertext`. Never sent to a browser: the read that builds a
     * row for the screen leaves this field out entirely.
     */
    passwordEncrypted: text("password_encrypted").notNull().default(""),
    /**
     * Two-letter country of the exit IP, written by a successful test rather
     * than typed. The fingerprint's timezone follows it, because a US exit on
     * a Moscow clock is an instant tell.
     */
    country: varchar("country", { length: 2 }).notNull().default(""),
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    /** The whole answer from the last test, kept so a screen can show any part. */
    lastTestResult: jsonb("last_test_result").$type<ProxyTestResult | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ix_promo_proxies_user").on(table.userId)]
)

/**
 * Each change of a proxy's outside address, written by a test only when the
 * address differs from the last row. A proxy sold as fixed that rotates shows
 * itself here. Trimmed to a fixed number of rows per proxy.
 */
export const promoProxyAddresses = pgTable(
  "promo_proxy_addresses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    proxyId: varchar("proxy_id", { length: 36 })
      .notNull()
      .references(() => promoProxies.id, { onDelete: "cascade" }),
    ip: varchar("ip", { length: 64 }).notNull(),
    country: varchar("country", { length: 2 }).notNull().default(""),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ix_promo_proxy_addresses_proxy").on(table.proxyId, table.seenAt.desc()),
  ]
)

/** A folder profiles can be put in. Deleting it leaves the profiles. */
export const promoProfileFolders = pgTable(
  "promo_profile_folders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_promo_profile_folders_user_name").on(
      table.userId,
      sql`lower(${table.name})`
    ),
  ]
)

/**
 * The state a person gives a profile: Ready, Warming, Banned, or a name of
 * their own. Not whether its browser runs, which is a session row.
 */
export const promoProfileLabels = pgTable(
  "promo_profile_labels",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    color: varchar("color", { length: 20 }).notNull().default("slate"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_promo_profile_labels_user_name").on(
      table.userId,
      sql`lower(${table.name})`
    ),
  ]
)

/**
 * One isolated browser: its own cookies, its own identity, its own proxy.
 *
 * The shape is anti-detect's `profiles` table without the folders, labels and
 * tags, which come later. Whether its browser is open is not a column here: it
 * is a live row in `promo_browser_sessions`, so the two can never disagree.
 */
export const promoProfiles = pgTable(
  "promo_profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    /** Null means the browser goes out from this machine's own address. */
    proxyId: varchar("proxy_id", { length: 36 }).references(
      () => promoProxies.id,
      { onDelete: "set null" }
    ),
    /**
     * The profile's identity as the app keeps it: the identity file's id and
     * what a page read through it. The identity itself is a file in the
     * profile's volume, beside its cookies, because it is about 400KB.
     */
    fingerprint: jsonb("fingerprint").$type<ProfileIdentity | null>(),
    /** The last "Check what a site sees", or null until one is run. */
    siteCheck: jsonb("site_check").$type<SiteCheckResult | null>(),
    siteCheckedAt: timestamp("site_checked_at", { withTimezone: true }),
    /**
     * The Docker volume holding the cookies. Stored rather than worked out
     * from the id, because the profiles made from the first accounts kept the
     * volume those accounts already had, `promo-profile-<accountId>`, and
     * renaming a volume would sign every one of them out.
     */
    volumeName: varchar("volume_name", { length: 120 }).notNull(),
    notes: text("notes").notNull().default(""),
    folderId: varchar("folder_id", { length: 36 }).references(
      () => promoProfileFolders.id,
      { onDelete: "set null" }
    ),
    labelId: varchar("label_id", { length: 36 }).references(
      () => promoProfileLabels.id,
      { onDelete: "set null" }
    ),
    /** Free words to filter by. Trimmed, unique ignoring case, at most 20. */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_promo_profiles_user").on(table.userId),
    /** Two profiles on one volume would be one browser's cookies twice over. */
    uniqueIndex("ux_promo_profiles_volume").on(table.volumeName),
  ]
)

/**
 * A live isolated browser: one container on one profile's volume.
 *
 * The three partial unique indexes are the locks. The first stops a second
 * container ever opening the same profile, which would corrupt its cookies.
 * The other two make a port claim an insert that can lose, so two launches
 * racing never start two containers on one port.
 *
 * The table still has an `account_id` column, from when a browser belonged to
 * a Reddit account. It is kept, as every stored column is, and nothing reads
 * or writes it any more, which is why it is not listed here.
 */
export const promoBrowserSessions = pgTable(
  "promo_browser_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => promoProfiles.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 })
      .$type<SessionStatus>()
      .notNull()
      .default("starting"),
    containerId: varchar("container_id", { length: 80 }).notNull().default(""),
    /** Copied from the profile when the browser opened, so the log says which. */
    volumeName: varchar("volume_name", { length: 120 }).notNull().default(""),
    /** Where the command server answers, bound to 127.0.0.1 only. */
    commandPort: integer("command_port"),
    /** Where the video stream answers, so a person can watch and take over. */
    streamPort: integer("stream_port"),
    webrtcPort: integer("webrtc_port"),
    /**
     * What the stream window asks for, encrypted with the shell's
     * `encryptSecret`. Stored because a dashboard has to show it and the
     * dashboard is not the program that opened the browser. The command token
     * is the other secret and is never stored: it drives a signed-in browser.
     */
    streamPasswordEncrypted: text("stream_password_encrypted")
      .notNull()
      .default(""),
    lastError: text("last_error").notNull().default(""),
    /**
     * How the run ended. Blank on rows written before this was kept, which
     * the history reads from `status` instead.
     */
    endedBy: varchar("ended_by", { length: 20 })
      .$type<SessionEndedBy | "">()
      .notNull()
      .default(""),
    /** The proxy the browser opened with, so a later change can be spotted. */
    proxyId: varchar("proxy_id", { length: 36 }).references(
      () => promoProxies.id,
      { onDelete: "set null" }
    ),
    /** The country the browser went out from, as its proxy last tested. */
    exitCountry: varchar("exit_country", { length: 2 }).notNull().default(""),
    /** Docker's id for the image this run used. Blank before it was kept. */
    imageId: varchar("image_id", { length: 80 }).notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /**
     * Moved forward by every command. An hour of silence gets the container
     * reaped, because an idle Camoufox still holds about 1.5GB.
     */
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ux_promo_sessions_live_profile")
      .on(table.profileId)
      .where(sql`${table.status} IN ('starting', 'running')`),
    uniqueIndex("ux_promo_sessions_live_command_port")
      .on(table.commandPort)
      .where(
        sql`${table.status} IN ('starting', 'running') AND ${table.commandPort} IS NOT NULL`
      ),
    uniqueIndex("ux_promo_sessions_live_stream_port")
      .on(table.streamPort)
      .where(
        sql`${table.status} IN ('starting', 'running') AND ${table.streamPort} IS NOT NULL`
      ),
  ]
)

/**
 * Things that happened to a profile besides its browser's runs, for the
 * history tab in its window.
 */
export const promoProfileEvents = pgTable(
  "promo_profile_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    profileId: varchar("profile_id", { length: 36 })
      .notNull()
      .references(() => promoProfiles.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 30 }).$type<ProfileEventKind>().notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_promo_profile_events_profile").on(
      table.profileId,
      table.createdAt.desc()
    ),
  ]
)
