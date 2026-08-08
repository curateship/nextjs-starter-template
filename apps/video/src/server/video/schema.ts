import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
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

import { customShellMedia, customShellUsers } from "@/server/schema"

/**
 * The video app's own tables, kept apart from the shell's `src/server/schema.ts`
 * on purpose: that file belongs to the shell and editing it would fork this app
 * off future shell merges. Everything here points at shell rows by id and rides
 * along when those rows are deleted.
 */

/**
 * One smooth-playback copy per video in the library: a 720p MP4 with a keyframe
 * every second, so the editor can scrub without fighting the original file.
 * Built in the background; the row is the queue entry, the lease is the claim.
 */
export const videoMediaProxies = pgTable(
  "video_media_proxies",
  {
    mediaId: varchar("media_id", { length: 36 })
      .primaryKey()
      .references(() => customShellMedia.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull(),
    profile: varchar("profile", { length: 40 }).notNull(),
    storagePath: text("storage_path").unique(),
    fileSize: bigint("file_size", { mode: "number" }),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "video_media_proxies_status_check",
      sql`${table.status} in ('queued', 'generating', 'ready', 'error')`
    ),
    check(
      "video_media_proxies_profile_check",
      sql`${table.profile} = 'h264-720p'`
    ),
    check(
      "video_media_proxies_ready_check",
      sql`${table.status} <> 'ready' or ${table.storagePath} is not null`
    ),
    check("video_media_proxies_attempts_check", sql`${table.attempts} >= 0`),
    index("ix_video_media_proxies_status_created").on(
      table.status,
      table.createdAt
    ),
  ]
)

/**
 * One tiled sprite of frames per video — roughly a frame every two seconds,
 * capped at 120 — that the timeline slices into clip thumbnails with CSS. The
 * geometry columns describe the grid; all five must be present before a strip
 * counts as ready, because a consumer that guesses at the grid draws garbage.
 */
export const videoMediaFilmstrips = pgTable(
  "video_media_filmstrips",
  {
    mediaId: varchar("media_id", { length: 36 })
      .primaryKey()
      .references(() => customShellMedia.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull(),
    profile: varchar("profile", { length: 40 }).notNull(),
    storagePath: text("storage_path").unique(),
    frameCount: integer("frame_count"),
    frameWidth: integer("frame_width"),
    frameHeight: integer("frame_height"),
    columns: integer("columns"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "video_media_filmstrips_status_check",
      sql`${table.status} in ('queued', 'generating', 'ready', 'error')`
    ),
    check(
      "video_media_filmstrips_profile_check",
      sql`${table.profile} = 'jpeg-160h-v1'`
    ),
    check(
      "video_media_filmstrips_ready_check",
      sql`${table.status} <> 'ready' or (${table.storagePath} is not null and ${table.frameCount} > 0 and ${table.frameWidth} > 0 and ${table.frameHeight} > 0 and ${table.columns} > 0 and ${table.durationMs} > 0)`
    ),
    check("video_media_filmstrips_attempts_check", sql`${table.attempts} >= 0`),
    index("ix_video_media_filmstrips_status_created").on(
      table.status,
      table.createdAt
    ),
  ]
)

/**
 * Named groups for the media library — "B-roll", "Hooks" — owned per person.
 * The unique index is on the lowercased name so "b-roll" cannot sit beside
 * "B-Roll"; the server collapses whitespace before saving for the same reason.
 */
export const videoMediaCollections = pgTable(
  "video_media_collections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_video_media_collections_user_id").on(table.userId),
    uniqueIndex("ux_video_media_collections_user_name").on(
      table.userId,
      sql`lower(${table.name})`
    ),
  ]
)

/**
 * Membership rows. Deleting a collection detaches its media, never destroys
 * it, and deleting media takes its memberships along — both by cascade.
 */
export const videoMediaCollectionItems = pgTable(
  "video_media_collection_items",
  {
    collectionId: varchar("collection_id", { length: 36 })
      .notNull()
      .references(() => videoMediaCollections.id, { onDelete: "cascade" }),
    mediaId: varchar("media_id", { length: 36 })
      .notNull()
      .references(() => customShellMedia.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.mediaId] }),
    index("ix_video_media_collection_items_media_id").on(table.mediaId),
  ]
)

/**
 * A project is one timeline, stored as a single JSON document so a new clip
 * field never means a migration. `aspect` is copied out of that document by the
 * same code that writes it — it exists only so the projects list can be drawn
 * without reading every timeline, and it is never accepted from the browser on
 * its own.
 *
 * `version` is the compare-and-swap token: a save carries the version it
 * loaded and lands only if the project is still on it, so a second tab is told
 * it lost rather than silently overwriting the newer work.
 */
export const videoProjects = pgTable(
  "video_projects",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    aspect: varchar("aspect", { length: 8 }).notNull(),
    timeline: jsonb("timeline").notNull(),
    version: integer("version").notNull().default(1),
    thumbnailMediaId: varchar("thumbnail_media_id", { length: 36 }).references(
      () => customShellMedia.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "video_projects_aspect_check",
      sql`${table.aspect} in ('16:9', '9:16', '1:1', '4:3')`
    ),
    check("video_projects_version_check", sql`${table.version} >= 1`),
    index("ix_video_projects_user_updated").on(table.userId, table.updatedAt),
    index("ix_video_projects_thumbnail_media_id").on(table.thumbnailMediaId),
  ]
)

/**
 * The brand kit every project draws with: one row, kept that way by the check
 * on `id`. The kit itself is a JSON document read through a normalizer, the
 * same shape the shell uses for its own styling settings, so a later feature
 * can add a field without a migration or a column that is null everywhere.
 */
export const videoSettings = pgTable(
  "video_settings",
  {
    id: varchar("id", { length: 20 }).primaryKey(),
    brandKit: jsonb("brand_kit").notNull(),
    // The voice scripts are read in, remembered so it is not picked every time.
    // Empty until somebody saves one.
    voiceDefaults: jsonb("voice_defaults").notNull().default({}),
    // Which AI writes down speech, and which one rewrites words. Empty until
    // somebody chooses, at which point the choice sticks.
    aiDefaults: jsonb("ai_defaults").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("video_settings_single_row_check", sql`${table.id} = 'default'`),
  ]
)

/**
 * An export: what was asked for, and what came out.
 *
 * The same row is the queue entry and the finished file. A worker claims it,
 * holds a lease it renews while ffmpeg runs, and anything whose lease runs out
 * is picked up again — which is what makes a render survive a restart without
 * ever running twice. The gallery is simply the rows that reached "ready".
 */
export const videoRenderJobs = pgTable(
  "video_render_jobs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => videoProjects.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull(),
    quality: varchar("quality", { length: 10 }).notNull(),
    normalizeLoudness: boolean("normalize_loudness").notNull().default(true),
    attempts: integer("attempts").notNull().default(0),
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    storagePath: text("storage_path").unique(),
    fileSize: bigint("file_size", { mode: "number" }),
    thumbnailStoragePath: text("thumbnail_storage_path"),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    title: varchar("title", { length: 200 }),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "video_render_jobs_status_check",
      sql`${table.status} in ('queued', 'running', 'ready', 'error', 'cancelled')`
    ),
    check(
      "video_render_jobs_quality_check",
      sql`${table.quality} in ('high', 'medium', 'low')`
    ),
    check(
      "video_render_jobs_ready_check",
      sql`${table.status} <> 'ready' or ${table.storagePath} is not null`
    ),
    check("video_render_jobs_attempts_check", sql`${table.attempts} >= 0`),
    // One export at a time per project. Partial, so the finished ones pile up
    // freely: this is what makes pressing Export twice hand back the first job
    // rather than start a second.
    uniqueIndex("ux_video_render_jobs_project_active")
      .on(table.projectId)
      .where(sql`${table.status} in ('queued', 'running')`),
    index("ix_video_render_jobs_status_created").on(
      table.status,
      table.createdAt
    ),
    index("ix_video_render_jobs_user_created").on(table.userId, table.createdAt),
  ]
)

export type VideoMediaProxy = typeof videoMediaProxies.$inferSelect
export type VideoMediaFilmstrip = typeof videoMediaFilmstrips.$inferSelect
export type VideoMediaCollection = typeof videoMediaCollections.$inferSelect
export type VideoProjectRow = typeof videoProjects.$inferSelect
export type VideoRenderJobRow = typeof videoRenderJobs.$inferSelect
