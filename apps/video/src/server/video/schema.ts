import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  doublePrecision,
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

import type {
  BriefLanding,
  BriefPlatform,
  BriefStatus,
  BriefVoice,
  StoredScene,
} from "@/lib/video/brief"
import type { AiPart } from "@/lib/video/ai-parts"
import type { ExtraPicks, SentExtra } from "@/lib/video/extras"
import type { ClipOutcome } from "@/lib/video/moving-still"
import type { ScriptCheck } from "@/lib/video/script-check"
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
 * The shape of the sound in one audio or video file, for drawing along a sound
 * clip. One byte per point, 0 to 255, where 255 is the loudest moment in that
 * file. The points sit in the row as base64 rather than in a stored file: at
 * most 30,000 points is about 40KB of text, and keeping it here saves a storage
 * key to write, serve and clean up. A file with no sound track is ready with
 * zero points, so nothing waits on it forever.
 */
export const videoMediaWaveforms = pgTable(
  "video_media_waveforms",
  {
    mediaId: varchar("media_id", { length: 36 })
      .primaryKey()
      .references(() => customShellMedia.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull(),
    profile: varchar("profile", { length: 40 }).notNull(),
    peaks: text("peaks"),
    pointCount: integer("point_count"),
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
      "video_media_waveforms_status_check",
      sql`${table.status} in ('queued', 'generating', 'ready', 'error')`
    ),
    check(
      "video_media_waveforms_profile_check",
      sql`${table.profile} = 'u8-peaks-25ps-v1'`
    ),
    check(
      "video_media_waveforms_ready_check",
      sql`${table.status} <> 'ready' or (${table.peaks} is not null and coalesce(${table.pointCount}, -1) >= 0 and (${table.pointCount} = 0 or coalesce(${table.durationMs}, 0) > 0))`
    ),
    check("video_media_waveforms_attempts_check", sql`${table.attempts} >= 0`),
    index("ix_video_media_waveforms_status_created").on(
      table.status,
      table.createdAt
    ),
  ]
)

/**
 * The words said in one audio or video file, written down once and read by
 * Captions, Tighten and the Words panel (see `src/server/video/transcripts.ts`
 * and migration 0120). One row per file and transcriber, because Whisper
 * measures each word's time and Gemini estimates it. `words` is a list of
 * `{ text, startMs, endMs }` timed from the start of the file, never from a
 * clip or the timeline, so trimming or moving a clip never makes it wrong.
 * Deleting the file removes it.
 */
export const videoMediaTranscripts = pgTable(
  "video_media_transcripts",
  {
    mediaId: varchar("media_id", { length: 36 })
      .notNull()
      .references(() => customShellMedia.id, { onDelete: "cascade" }),
    transcriber: varchar("transcriber", { length: 20 }).notNull(),
    model: varchar("model", { length: 60 }).notNull(),
    words: jsonb("words").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.mediaId, table.transcriber] }),
    check(
      "video_media_transcripts_transcriber_check",
      sql`${table.transcriber} in ('openai', 'gemini')`
    ),
    check(
      "video_media_transcripts_duration_check",
      sql`${table.durationMs} >= 0`
    ),
  ]
)

/**
 * Sound files marked as music, for the studio's Music panel. A mark on a file
 * the media library already holds: the file's owner owns the mark, and
 * deleting the file removes it.
 */
export const videoMusicTracks = pgTable("video_music_tracks", {
  mediaId: varchar("media_id", { length: 36 })
    .primaryKey()
    .references(() => customShellMedia.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
})

/**
 * The voiceover shelf (see `src/server/video/voiceovers.ts`): what a
 * voiceover said, who said it and the captions that came back with it, kept
 * beside the sound file so it can be reused without being read again. The
 * captions are read through `readSavedCaptions`. Deleting the file removes it.
 */
export const videoVoiceovers = pgTable("video_voiceovers", {
  mediaId: varchar("media_id", { length: 36 })
    .primaryKey()
    .references(() => customShellMedia.id, { onDelete: "cascade" }),
  script: text("script").notNull(),
  voiceId: varchar("voice_id", { length: 64 }).notNull(),
  voiceName: varchar("voice_name", { length: 255 }).notNull(),
  durationMs: integer("duration_ms").notNull(),
  captions: jsonb("captions").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
})

/**
 * Voices people made from their own sample in the Voices panel (see
 * `src/server/video/cloned-voices.ts`). The voice itself lives at ElevenLabs
 * under `voice_id`; this row says whose it is, so only its owner sees it in a
 * voice list or can read with it. The sample stays in the media library, and
 * deleting the file there only blanks `sample_media_id`, because the voice at
 * ElevenLabs keeps working without it.
 */
export const videoClonedVoices = pgTable(
  "video_cloned_voices",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    voiceId: varchar("voice_id", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    sampleMediaId: varchar("sample_media_id", { length: 36 }).references(
      () => customShellMedia.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ix_video_cloned_voices_user_id").on(table.userId)]
)

/**
 * Each person's sticker list for the studio's Text panel (see
 * `src/lib/video/stickers.ts`). The whole list is one JSON value read through
 * `readStickerList`, because its order is the order the panel shows. No row
 * means the person has never changed the built-in eight.
 */
export const videoStickerLists = pgTable("video_sticker_lists", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  stickers: jsonb("stickers").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

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
    // The project's look (see workspace/docs/visual-style.md): a style line
    // every AI picture and clip made for it starts from, and a library picture
    // to copy the look of. Kept beside the timeline rather than in it, so
    // changing the look from Project settings never moves `version` and never
    // clashes with an open editor. Deleting the picture blanks the column.
    style: varchar("style", { length: 500 }),
    styleMediaId: varchar("style_media_id", { length: 36 }).references(
      () => customShellMedia.id,
      { onDelete: "set null" }
    ),
    // The viral video this project copies, set by Copy this. Deleting the
    // saved video blanks it and the project stays.
    sourceViralVideoId: varchar("source_viral_video_id", {
      length: 36,
    }).references(() => videoViralVideos.id, { onDelete: "set null" }),
    // The copied video's title, written just before that saved video is
    // deleted, so the Copy panel can still name what it copied. Empty while
    // the video is still there.
    sourceViralVideoTitle: text("source_viral_video_title"),
    // The Viral project Copy this was pressed in. Deleting that project blanks
    // it and this one stays.
    sourceViralProjectId: varchar("source_viral_project_id", {
      length: 36,
    }).references(() => videoViralProjects.id, { onDelete: "set null" }),
    // An archived project leaves the list and keeps everything.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // A pinned project sits at the top of the list whatever the sort.
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    // The most AI spending the project may reach, in cents. Null is no limit.
    spendLimitCents: integer("spend_limit_cents"),
    // "Sam via Project" when a guest sent from Project made the last save,
    // null when the owner did (`drizzle/0125_video_project_guests.sql`).
    lastEditedBy: text("last_edited_by"),
    // The extras picked in the AI clip panel, one extra id per kind, so a
    // series keeps the same outfit and place (drizzle/0124).
    extraPicks: jsonb("extra_picks").$type<ExtraPicks>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "video_projects_spend_limit_check",
      sql`${table.spendLimitCents} is null or ${table.spendLimitCents} between 1 and 10000000`
    ),
    check(
      "video_projects_aspect_check",
      sql`${table.aspect} in ('16:9', '9:16', '1:1', '4:3')`
    ),
    check("video_projects_version_check", sql`${table.version} >= 1`),
    index("ix_video_projects_user_updated").on(table.userId, table.updatedAt),
  ]
)

/**
 * Earlier timelines of a project, kept by the save itself (see
 * `workspace/docs/project-history.md`). A row is the timeline as it was just
 * before a save replaced it. `saved_at` is when that timeline was last saved;
 * `created_at` is when the row was made, which the hourly rule measures from.
 */
export const videoProjectVersions = pgTable(
  "video_project_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => videoProjects.id, { onDelete: "cascade" }),
    // Who made the save that kept it.
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 16 }).notNull(),
    timeline: jsonb("timeline").notNull(),
    aspect: varchar("aspect", { length: 8 }).notNull(),
    clipCount: integer("clip_count").notNull(),
    durationMs: integer("duration_ms").notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    // "Sam via Project" when a guest sent from Project made the save that
    // kept it, null when the owner did (`drizzle/0125_video_project_guests.sql`).
    editedBy: text("edited_by"),
  },
  (table) => [
    check(
      "ck_video_project_versions_reason",
      sql`${table.reason} in ('break', 'hourly', 'restore')`
    ),
    index("ix_video_project_versions_project_created").on(
      table.projectId,
      table.createdAt
    ),
  ]
)

/**
 * The picture beside a project on the projects list: one frame of the first
 * video or picture clip, made by the background worker and kept outside the
 * media library (see `workspace/docs/project-thumbnails.md`). The row is the
 * queue entry and the lease is the claim, the same as the media side tables.
 * `none` means the timeline has nothing to take a frame of, and is never tried.
 */
export const videoProjectThumbnails = pgTable(
  "video_project_thumbnails",
  {
    projectId: varchar("project_id", { length: 36 })
      .primaryKey()
      .references(() => videoProjects.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull(),
    sourceMediaId: varchar("source_media_id", { length: 36 }),
    sourceAtMs: integer("source_at_ms"),
    storagePath: text("storage_path"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "video_project_thumbnails_status_check",
      sql`${table.status} in ('queued', 'generating', 'ready', 'error', 'none')`
    ),
    check(
      "video_project_thumbnails_ready_check",
      sql`${table.status} <> 'ready' or ${table.storagePath} is not null`
    ),
    index("ix_video_project_thumbnails_status").on(
      table.status,
      table.updatedAt
    ),
  ]
)

/**
 * Folders for projects, owned per person, the same shape as media collections
 * (see `workspace/docs/project-folders.md`). The unique index is on the
 * lowercased name, and the server collapses whitespace before saving.
 */
export const videoProjectFolders = pgTable(
  "video_project_folders",
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
    index("ix_video_project_folders_user_id").on(table.userId),
    uniqueIndex("ux_video_project_folders_user_name").on(
      table.userId,
      sql`lower(${table.name})`
    ),
  ]
)

/**
 * Which folder a project is in. The project is the whole key, so a project is
 * in one folder at most; no row means no folder. Deleting a folder deletes its
 * rows and never its projects.
 */
export const videoProjectFolderItems = pgTable(
  "video_project_folder_items",
  {
    projectId: varchar("project_id", { length: 36 })
      .primaryKey()
      .references(() => videoProjects.id, { onDelete: "cascade" }),
    folderId: varchar("folder_id", { length: 36 })
      .notNull()
      .references(() => videoProjectFolders.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_video_project_folder_items_folder_id").on(table.folderId),
  ]
)

/**
 * One row per editor window that has a project open, written every 15 seconds
 * while it stays open. It is what lets a second window say "this is already
 * being edited somewhere else" before any work is done in it.
 */
export const videoEditorWindows = pgTable(
  "video_editor_windows",
  {
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => videoProjects.id, { onDelete: "cascade" }),
    windowId: varchar("window_id", { length: 36 }).notNull(),
    mode: varchar("mode", { length: 8 }).notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.windowId] }),
    check("video_editor_windows_mode_check", sql`${table.mode} in ('edit', 'view')`),
  ]
)

/**
 * One carousel studio document. Slides stay together as validated JSON so a
 * new layer setting does not require a column, while `format` and `version`
 * remain cheap to list and safe to compare during auto-save.
 */
export const videoCarousels = pgTable(
  "video_carousels",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    format: varchar("format", { length: 8 }).notNull(),
    slides: jsonb("slides").notNull(),
    caption: text("caption").notNull().default(""),
    version: integer("version").notNull().default(1),
    // Offered under "A template" in New carousel (`drizzle/0137`).
    isTemplate: boolean("is_template").notNull().default(false),
    // The video project it belongs to, if any (`drizzle/0138`). A project
    // deleted without deleting its carousels leaves them with none.
    projectId: varchar("project_id", { length: 36 }).references(
      () => videoProjects.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "video_carousels_format_check",
      sql`${table.format} in ('4:5', '1:1', '9:16')`
    ),
    check("video_carousels_version_check", sql`${table.version} >= 1`),
    index("ix_video_carousels_user_updated").on(table.userId, table.updatedAt),
    index("ix_video_carousels_user_templates")
      .on(table.userId)
      .where(sql`${table.isTemplate}`),
    index("ix_video_carousels_project")
      .on(table.projectId)
      .where(sql`${table.projectId} is not null`),
  ]
)

/**
 * Earlier slides of a carousel, kept by the save that replaces them, by the
 * same rule as a project's history (`drizzle/0139`,
 * `src/server/video/carousel-versions.ts`).
 */
export const videoCarouselVersions = pgTable(
  "video_carousel_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    carouselId: varchar("carousel_id", { length: 36 })
      .notNull()
      .references(() => videoCarousels.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 16 }).notNull(),
    slides: jsonb("slides").notNull(),
    format: varchar("format", { length: 8 }).notNull(),
    caption: text("caption").notNull().default(""),
    slideCount: integer("slide_count").notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "ck_video_carousel_versions_reason",
      sql`${table.reason} in ('break', 'hourly', 'restore')`
    ),
    index("ix_video_carousel_versions_carousel_created").on(
      table.carouselId,
      table.createdAt
    ),
  ]
)

/**
 * Files uploaded from one video editor stay on that project's media shelf.
 * The file itself remains an ordinary shell media row and can still be used by
 * a copied project; deleting either side only removes this membership row.
 */
export const videoProjectMedia = pgTable(
  "video_project_media",
  {
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => videoProjects.id, { onDelete: "cascade" }),
    mediaId: varchar("media_id", { length: 36 })
      .notNull()
      .references(() => customShellMedia.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.mediaId] }),
    index("ix_video_project_media_media_id").on(table.mediaId),
  ]
)

/** Files uploaded from one carousel editor stay on that carousel's shelf. */
export const videoCarouselMedia = pgTable(
  "video_carousel_media",
  {
    carouselId: varchar("carousel_id", { length: 36 })
      .notNull()
      .references(() => videoCarousels.id, { onDelete: "cascade" }),
    mediaId: varchar("media_id", { length: 36 })
      .notNull()
      .references(() => customShellMedia.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.carouselId, table.mediaId] }),
    index("ix_video_carousel_media_media_id").on(table.mediaId),
  ]
)

/**
 * The app's own settings: one row, kept that way by the check on `id`. Each
 * setting is its own column, written the first time somebody saves it.
 */
export const videoSettings = pgTable(
  "video_settings",
  {
    id: varchar("id", { length: 20 }).primaryKey(),
    // The voice scripts are read in, remembered so it is not picked every time.
    // Empty until somebody saves one.
    voiceDefaults: jsonb("voice_defaults").notNull().default({}),
    // Which AI writes down speech, and which one rewrites words. Empty until
    // somebody chooses, at which point the choice sticks.
    aiDefaults: jsonb("ai_defaults").notNull().default({}),
    // The YouTube Data API key for the Viral page, scrambled the same way the
    // shell scrambles AI keys. NULL falls back to VIDEO_YOUTUBE_API_KEY.
    youtubeApiKey: text("youtube_api_key"),
    // The Pexels API key the B-roll tool searches stock video with, scrambled
    // the same way. NULL means no key, and B-roll asks for one.
    pexelsApiKey: text("pexels_api_key"),
    // The words the script check flags, as a JSON list. NULL until somebody
    // saves a list on Settings → Scripts; the starter words apply until then.
    scriptBannedWords: jsonb("script_banned_words"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("video_settings_single_row_check", sql`${table.id} = 'default'`),
  ]
)

/**
 * A reusable generated character. The picture is an ordinary media-library
 * row, so deleting this record never silently destroys a file already used by
 * a project. The session-checked actor image route reads that same row.
 */
export const videoActors = pgTable(
  "video_actors",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    prompt: text("prompt").notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    tags: jsonb("tags").notNull().default([]),
    imageMediaId: varchar("image_media_id", { length: 36 })
      .notNull()
      .references(() => customShellMedia.id, { onDelete: "restrict" }),
    referenceMediaId: varchar("reference_media_id", {
      length: 36,
    }).references(() => customShellMedia.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "video_actors_status_check",
      sql`${table.status} in ('active', 'inactive')`
    ),
    index("ix_video_actors_user_created").on(table.userId, table.createdAt),
    index("ix_video_actors_image_media_id").on(table.imageMediaId),
    index("ix_video_actors_reference_media_id").on(table.referenceMediaId),
  ]
)

/**
 * One picture on an actor's character sheet, pointing at a Media file. The
 * main picture is the one `video_actors.image_media_id` names, and the app
 * keeps it on the sheet as well. Removing a row never deletes the file; a
 * file deleted from Media leaves the sheet with it. drizzle/0119 explains.
 */
export const videoActorSheetPictures = pgTable(
  "video_actor_sheet_pictures",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    actorId: varchar("actor_id", { length: 36 })
      .notNull()
      .references(() => videoActors.id, { onDelete: "cascade" }),
    mediaId: varchar("media_id", { length: 36 })
      .notNull()
      .references(() => customShellMedia.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 60 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_video_actor_sheet_pictures_actor_media").on(
      table.actorId,
      table.mediaId
    ),
    index("ix_video_actor_sheet_pictures_actor_created").on(
      table.actorId,
      table.createdAt
    ),
    index("ix_video_actor_sheet_pictures_media_id").on(table.mediaId),
  ]
)

/**
 * A clothing item, backdrop, prop or hair look: a name, one Media picture and
 * a description, picked for a first frame beside the actor. Deleting it keeps
 * the file; the file cannot be deleted while an extra uses it. drizzle/0124.
 */
export const videoExtras = pgTable(
  "video_extras",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    prompt: text("prompt").notNull(),
    imageMediaId: varchar("image_media_id", { length: 36 })
      .notNull()
      .references(() => customShellMedia.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "video_extras_kind_check",
      sql`${table.kind} in ('clothing', 'backdrop', 'prop', 'hair')`
    ),
    index("ix_video_extras_user_kind_created").on(
      table.userId,
      table.kind,
      table.createdAt
    ),
    index("ix_video_extras_image_media_id").on(table.imageMediaId),
  ]
)

/**
 * An opening image of an actor, made inside one project and belonging to it
 * alone. Deleting the project deletes it. `projectId` is null only on frames
 * made before 0112 that no timeline used; nothing shows those.
 */
export const videoFirstFrames = pgTable(
  "video_first_frames",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 }).references(
      () => videoProjects.id,
      { onDelete: "cascade" }
    ),
    actorId: varchar("actor_id", { length: 36 })
      .notNull()
      .references(() => videoActors.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    prompt: text("prompt").notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    aspectRatio: varchar("aspect_ratio", { length: 8 }).notNull(),
    tags: jsonb("tags").notNull().default([]),
    pinned: boolean("pinned").notNull().default(false),
    imageMediaId: varchar("image_media_id", { length: 36 })
      .notNull()
      .references(() => customShellMedia.id, { onDelete: "restrict" }),
    referenceMediaId: varchar("reference_media_id", {
      length: 36,
    }).references(() => customShellMedia.id, { onDelete: "set null" }),
    /** The actor's pictures this frame was drawn from, in the order sent. */
    actorMediaIds: jsonb("actor_media_ids").$type<string[]>().notNull().default([]),
    /** The extras it was made with, in the order sent (drizzle/0124). */
    extras: jsonb("extras").$type<SentExtra[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "video_first_frames_aspect_check",
      sql`${table.aspectRatio} in ('9:16', '16:9')`
    ),
    index("ix_video_first_frames_user_created").on(
      table.userId,
      table.createdAt
    ),
    index("ix_video_first_frames_project_created").on(
      table.projectId,
      table.createdAt
    ),
    index("ix_video_first_frames_actor_id").on(table.actorId),
    index("ix_video_first_frames_image_media_id").on(table.imageMediaId),
    index("ix_video_first_frames_reference_media_id").on(
      table.referenceMediaId
    ),
  ]
)

/**
 * A durable AI shot request. The background worker owns queued/processing rows, so
 * leaving or reloading the dashboard does not cancel the provider operation.
 *
 * One row is one piece of a shot. A shot longer than 8 seconds is several
 * rows sharing `shotId`, which is the first piece's own id. Every piece after
 * the first is 'waiting' until the one before it is ready, because it starts
 * from that piece's last frame.
 */
export const videoAiGenerations = pgTable(
  "video_ai_generations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => videoProjects.id, { onDelete: "cascade" }),
    // Null on a shot made from a picture already on the timeline, which
    // names that clip below instead (drizzle/0126).
    firstFrameId: varchar("first_frame_id", { length: 36 }).references(
      () => videoFirstFrames.id,
      { onDelete: "cascade" }
    ),
    firstFrameMediaId: varchar("first_frame_media_id", {
      length: 36,
    }).references(() => customShellMedia.id, { onDelete: "set null" }),
    prompt: text("prompt").notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    aspectRatio: varchar("aspect_ratio", { length: 8 }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    // The picture size asked for (drizzle/0125). Every Veo piece was 720p.
    resolution: varchar("resolution", { length: 8 }).notNull().default("720p"),
    shotId: varchar("shot_id", { length: 36 }).notNull(),
    shotIndex: integer("shot_index").notNull(),
    shotPieces: integer("shot_pieces").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    operationName: text("operation_name"),
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    outputMediaId: varchar("output_media_id", { length: 36 }).references(
      () => customShellMedia.id,
      { onDelete: "set null" }
    ),
    errorMessage: text("error_message"),
    attempts: integer("attempts").notNull().default(0),
    // What the piece is sent beyond its first frame, copied from the frame
    // when the shot is asked for. A null actor is a piece asked for before
    // drizzle/0124, sent exactly what it always was.
    actorId: varchar("actor_id", { length: 36 }).references(
      () => videoActors.id,
      { onDelete: "set null" }
    ),
    referenceMediaIds: jsonb("reference_media_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    extras: jsonb("extras").$type<SentExtra[]>().notNull().default([]),
    // A shot made from a picture on the timeline (drizzle/0126): the clip it
    // replaces, where it sat and how long it ran when asked for, and whether
    // it has landed. Null on every shot made in the AI clip panel.
    clipId: varchar("clip_id", { length: 64 }),
    // The file that clip showed when the shot was asked for (drizzle/0128):
    // the picture for Make it move, the moving shot for Make it again. The
    // shot lands only while the clip still shows it.
    clipMediaId: varchar("clip_media_id", { length: 36 }),
    clipStartMs: doublePrecision("clip_start_ms"),
    clipDurationMs: doublePrecision("clip_duration_ms"),
    clipOutcome: varchar("clip_outcome", { length: 8 }).$type<ClipOutcome>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "video_ai_generations_status_check",
      sql`${table.status} in ('waiting', 'queued', 'processing', 'ready', 'error')`
    ),
    check(
      "video_ai_generations_shot_check",
      sql`${table.shotPieces} between 1 and 4 and ${table.shotIndex} between 1 and ${table.shotPieces}`
    ),
    check(
      "video_ai_generations_aspect_check",
      sql`${table.aspectRatio} in ('9:16', '16:9')`
    ),
    check(
      "video_ai_generations_duration_check",
      sql`${table.durationSeconds} in (4, 6, 8)`
    ),
    check("video_ai_generations_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "video_ai_generations_clip_check",
      sql`(${table.clipId} is null and ${table.clipStartMs} is null and ${table.clipDurationMs} is null and ${table.clipOutcome} is null) or (${table.clipId} is not null and ${table.clipStartMs} is not null and ${table.clipDurationMs} is not null)`
    ),
    check(
      "video_ai_generations_source_check",
      sql`${table.firstFrameId} is not null or ${table.clipId} is not null`
    ),
    check(
      "video_ai_generations_clip_outcome_check",
      sql`${table.clipOutcome} is null or ${table.clipOutcome} in ('replaced', 'gone')`
    ),
    check(
      "video_ai_generations_ready_check",
      sql`${table.status} <> 'ready' or ${table.outputMediaId} is not null`
    ),
    check(
      "video_ai_generations_lease_check",
      sql`(${table.leaseToken} is null) = (${table.leaseExpiresAt} is null)`
    ),
    // How many may be queued or processing at once is a trigger, not an
    // index: drizzle/0117_video_shots_at_once.sql.
    index("ix_video_ai_generations_user_running")
      .on(table.userId, table.projectId)
      .where(sql`${table.status} in ('queued', 'processing')`),
    index("ix_video_ai_generations_user_created").on(
      table.userId,
      table.createdAt
    ),
    index("ix_video_ai_generations_first_frame_id").on(table.firstFrameId),
    index("ix_video_ai_generations_shot").on(table.shotId, table.shotIndex),
    index("ix_video_ai_generations_unlanded")
      .on(table.projectId)
      .where(sql`${table.clipId} is not null and ${table.clipOutcome} is null`),
    index("ix_video_ai_generations_output_media_id").on(table.outputMediaId),
    index("ix_video_ai_generations_processing_lease").on(
      table.status,
      table.leaseExpiresAt
    ),
  ]
)

/**
 * An export: what was asked for, and what came out.
 *
 * The same row is the queue entry and the finished file. A worker claims it,
 * holds a lease it renews while ffmpeg runs, and anything whose lease runs out
 * is picked up again — which is what makes a render survive a restart without
 * ever running twice. The gallery is simply the rows that reached "ready".
 *
 * A kept carousel is a row here too, of kind `carousel` (see
 * `src/server/video/carousel-exports.ts`): a ZIP of its slides, written ready
 * in one step and never queued. It has no project. Its carousel is remembered
 * until that carousel is deleted, which leaves the export where it is.
 */
export const videoRenderJobs = pgTable(
  "video_render_jobs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    // `video` (a project rendered by the queue) or `carousel`.
    kind: varchar("kind", { length: 10 }).notNull().default("video"),
    // Every video export has one; a carousel export never does.
    projectId: varchar("project_id", { length: 36 }).references(
      () => videoProjects.id,
      { onDelete: "cascade" }
    ),
    carouselId: varchar("carousel_id", { length: 36 }).references(
      () => videoCarousels.id,
      { onDelete: "set null" }
    ),
    // A carousel's caption as it was exported, the words in its caption.txt.
    caption: text("caption"),
    // Where each slide's PNG sits inside a carousel's ZIP, in slide order, so
    // the share page can read one slide without fetching the whole file.
    slideRanges: jsonb("slide_ranges").$type<CarouselSlideRange[]>(),
    status: varchar("status", { length: 20 }).notNull(),
    quality: varchar("quality", { length: 10 }).notNull(),
    // The shape this export is made in. It belongs to the export, not the
    // project, so one project can be exported tall, square and wide at once.
    aspect: varchar("aspect", { length: 8 }).notNull(),
    normalizeLoudness: boolean("normalize_loudness").notNull().default(true),
    // Frames a second in the file: 30 or 60. Thirty is what every export was
    // made at before there was a choice.
    frameRate: integer("frame_rate").notNull().default(30),
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
    // Which parts of the file the AI made, worked out by the render from the
    // timeline it drew. Null before drizzle/0131 and on carousel exports.
    aiParts: jsonb("ai_parts").$type<AiPart[]>(),
    // Whether the copied paragraph says a person edited them too.
    aiHandEdited: boolean("ai_hand_edited").notNull().default(true),
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
    check(
      "video_render_jobs_aspect_check",
      sql`${table.aspect} in ('16:9', '9:16', '1:1', '4:3', '4:5')`
    ),
    check(
      "video_render_jobs_kind_check",
      sql`(${table.kind} = 'video' and ${table.projectId} is not null) or (${table.kind} = 'carousel' and ${table.projectId} is null and ${table.slideRanges} is not null)`
    ),
    check(
      "video_render_jobs_frame_rate_check",
      sql`${table.frameRate} in (30, 60)`
    ),
    check("video_render_jobs_attempts_check", sql`${table.attempts} >= 0`),
    // One export at a time per project and shape. Partial, so the finished
    // ones pile up freely. Two requests for the same shape arriving together
    // cannot both land: the second is refused here.
    uniqueIndex("ux_video_render_jobs_project_aspect_active")
      .on(table.projectId, table.aspect)
      .where(sql`${table.status} in ('queued', 'running')`),
    index("ix_video_render_jobs_status_created").on(
      table.status,
      table.createdAt
    ),
    index("ix_video_render_jobs_user_created").on(table.userId, table.createdAt),
    index("ix_video_render_jobs_carousel_id")
      .on(table.carouselId)
      .where(sql`${table.carouselId} is not null`),
  ]
)

/**
 * One slide's file inside a kept carousel ZIP: its first byte and its size.
 * A PNG unless `type` says it is a video slide's MP4.
 */
export type CarouselSlideRange = { start: number; size: number; type?: "video" }

/**
 * A link to one finished export that anybody holding it can watch without an
 * account (see `src/server/video/export-shares.ts`). The token is the only
 * lock, so it is 32 random bytes. A link is dead once revoked, once past its
 * expiry, or once its export is deleted, which deletes the row. At most one
 * unrevoked link per export.
 */
export const videoExportShares = pgTable(
  "video_export_shares",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    token: varchar("token", { length: 64 }).notNull().unique(),
    exportId: varchar("export_id", { length: 36 })
      .notNull()
      .references(() => videoRenderJobs.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ux_video_export_shares_export_live")
      .on(table.exportId)
      .where(sql`${table.revokedAt} is null`),
  ]
)

/**
 * The one-time id of every note Project has sent here that was used, so a
 * copied handoff address fails (`drizzle/0125_video_project_guests.sql`).
 */
export const videoHandoffNotes = pgTable("video_handoff_notes", {
  noteId: varchar("note_id", { length: 64 }).primaryKey(),
  usedAt: timestamp("used_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
})

/**
 * A guest sent from Project: signed in to one video project for 12 hours,
 * with no account here. Only the cookie token's SHA-256 is kept. How it works
 * is in `workspace/docs/project-guests.md`.
 */
export const videoProjectGuests = pgTable(
  "video_project_guests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => videoProjects.id, { onDelete: "cascade" }),
    /** Who they are in Project: their id there, name and email. */
    personId: varchar("person_id", { length: 36 }).notNull(),
    personName: text("person_name").notNull(),
    personEmail: text("person_email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ix_video_project_guests_project").on(table.projectId)]
)

export type VideoProjectGuestRow = typeof videoProjectGuests.$inferSelect

export type VideoMediaProxy = typeof videoMediaProxies.$inferSelect
export type VideoMediaFilmstrip = typeof videoMediaFilmstrips.$inferSelect
export type VideoMediaCollection = typeof videoMediaCollections.$inferSelect
export type VideoProjectRow = typeof videoProjects.$inferSelect
export type VideoProjectVersionRow = typeof videoProjectVersions.$inferSelect
export type VideoProjectThumbnailRow = typeof videoProjectThumbnails.$inferSelect
export type VideoCarouselRow = typeof videoCarousels.$inferSelect
export type VideoRenderJobRow = typeof videoRenderJobs.$inferSelect
export type VideoActorRow = typeof videoActors.$inferSelect
export type VideoActorSheetPictureRow = typeof videoActorSheetPictures.$inferSelect
export type VideoExtraRow = typeof videoExtras.$inferSelect
export type VideoFirstFrameRow = typeof videoFirstFrames.$inferSelect
export type VideoAiGenerationRow = typeof videoAiGenerations.$inferSelect


/**
 * One creator somebody follows, on one platform. The handle is stored
 * lowercased and matched that way, so adding @Alice and @alice twice is one
 * creator rather than two — the same rule the old app matched on.
 *
 * Deleting a creator takes its saved posts with it but leaves any saved
 * breakdown standing: the archive stores the channel as plain text and has no
 * key pointing back here, so a video you studied survives losing interest in
 * whoever made it.
 */
export const videoCreators = pgTable(
  "video_creators",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    handle: varchar("handle", { length: 100 }).notNull(),
    /**
     * YouTube's own channel id, kept because the Data API needs it to list
     * uploads and resolving a handle to one costs a unit. Null on the other
     * two platforms, which are read by their handle.
     */
    platformChannelId: varchar("platform_channel_id", { length: 100 }),
    displayName: text("display_name"),
    followerCount: bigint("follower_count", { mode: "number" }),
    avatarStoragePath: text("avatar_storage_path"),
    profileUrl: text("profile_url").notNull(),
    /** Off means the watch timer skips this creator but keeps its posts. */
    watch: boolean("watch").notNull().default(true),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    /** "viral" when the Follow button on the Viral page added it. */
    source: varchar("source", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_video_creators_owner_platform_handle").on(
      table.ownerId,
      table.platform,
      sql`lower(${table.handle})`
    ),
    index("ix_video_creators_watch").on(table.watch, table.lastCheckedAt),
  ]
)

/**
 * One video a followed creator posted, as the watch timer found it. Metadata
 * only — no file is ever downloaded to make one of these rows, which is what
 * keeps the timer cheap enough to run unattended.
 *
 * `firstSeenAt` exists because not every platform says when something was
 * posted; a project's grid orders by the posted date when there is one and by
 * when it was first seen when there is not, so a post never falls off the end.
 */
export const videoCreatorPosts = pgTable(
  "video_creator_posts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    creatorId: varchar("creator_id", { length: 36 })
      .notNull()
      .references(() => videoCreators.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 100 }).notNull(),
    url: text("url").notNull(),
    title: text("title"),
    thumbnailUrl: text("thumbnail_url"),
    durationSeconds: integer("duration_seconds"),
    views: bigint("views", { mode: "number" }),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    /**
     * The app's own copy of the cover picture. TikTok and Instagram cover
     * addresses stop working after a set date, so the card shows this copy
     * whenever there is one.
     */
    thumbnailStoragePath: text("thumbnail_storage_path"),
    /** When the app last tried to keep a copy of the cover. */
    coverCheckedAt: timestamp("cover_checked_at", { withTimezone: true }),
  },
  (table) => [
    // The same video seen twice (two projects, a second tick) updates this row
    // rather than adding another. It is also the key the archive is joined on.
    uniqueIndex("ux_video_creator_posts_owner_video").on(
      table.ownerId,
      table.platform,
      table.platformVideoId
    ),
    index("ix_video_creator_posts_feed").on(table.ownerId, table.postedAt),
    index("ix_video_creator_posts_creator").on(table.creatorId, table.postedAt),
  ]
)

/**
 * A video somebody pressed Download or AI analyse on: the downloaded file, and
 * what Gemini made of it.
 *
 * The status is the job. A worker claims a `waiting` row, downloads it, then
 * has Gemini watch it unless it was saved with Download alone, which stops at
 * `downloaded`. A restart puts an interrupted row back to `waiting`
 * — so closing the browser never strands a half-done job. A failure keeps its
 * reason in `error` and can be tried again.
 *
 * It has no key pointing at a creator on purpose. A saved video belongs to the
 * person who saved it, not to whoever is being followed this week, so deleting
 * a creator leaves it alone. The channel is kept as plain text instead.
 */
export const videoViralVideos = pgTable(
  "video_viral_videos",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 100 }).notNull(),
    sourceUrl: text("source_url").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    /**
     * False when it was saved with Download alone: the worker stops at
     * `downloaded` and no AI runs. AI analyse sets it true.
     */
    wantsAnalysis: boolean("wants_analysis").notNull().default(true),
    error: text("error"),
    /** The downloaded file, once it is in the shell's library. */
    mediaId: varchar("media_id", { length: 36 }).references(
      () => customShellMedia.id,
      { onDelete: "set null" }
    ),
    thumbnailStoragePath: text("thumbnail_storage_path"),
    title: text("title"),
    channelName: text("channel_name"),
    /**
     * YouTube's channel id, or @handle on TikTok and Instagram, from yt-dlp.
     * A pasted video has no search result to take it from (drizzle/0136).
     */
    channelId: varchar("channel_id", { length: 100 }),
    /** The channel's followers, from yt-dlp. Null where the platform hides it. */
    subscribers: bigint("subscribers", { mode: "number" }),
    durationSeconds: integer("duration_seconds"),
    views: bigint("views", { mode: "number" }),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    /** The transcript, parts and scene cuts, once Gemini has watched it. */
    breakdown: jsonb("breakdown"),
    /** Who is working on it now, and until when. Null means free to claim. */
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    /**
     * The Viral project whose Save & break down made it, so the breakdown's AI
     * cost counts against that project's spend limit. Null when it was saved
     * anywhere else, or the project was deleted.
     */
    viralProjectId: varchar("viral_project_id", { length: 36 }).references(
      () => videoViralProjects.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    // Pressing the button twice, or saving the same video from two projects,
    // is one row. The project screen joins on these three columns.
    uniqueIndex("ux_video_viral_videos_owner_video").on(
      table.ownerId,
      table.platform,
      table.platformVideoId
    ),
    index("ix_video_viral_videos_status").on(table.status, table.updatedAt),
    check(
      "ck_video_viral_videos_status",
      sql`${table.status} in ('waiting', 'downloading', 'downloaded', 'analysing', 'ready', 'failed')`
    ),
  ]
)

export type VideoCreatorRow = typeof videoCreators.$inferSelect
export type VideoCreatorPostRow = typeof videoCreatorPosts.$inferSelect
export type VideoViralVideoRow = typeof videoViralVideos.$inferSelect

/**
 * Viral's own folders, apart from the editor's so the two lists never mix.
 * Names are unique per person ignoring case.
 */
export const videoViralProjectFolders = pgTable(
  "video_viral_project_folders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_video_viral_project_folders_owner_name").on(
      table.ownerId,
      sql`lower(${table.name})`
    ),
  ]
)

/**
 * One Viral project: a niche, described in words, searched by its keywords.
 *
 * `days` and `videoLength` are what YouTube is asked, so changing them means
 * searching again. Minimum views and minimum score are applied when results
 * are read, so changing them costs nothing. `unitsSpent` adds up every
 * YouTube unit this project's searches and creator look-ups used.
 */
export const videoViralProjects = pgTable(
  "video_viral_projects",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    folderId: varchar("folder_id", { length: 36 }).references(
      () => videoViralProjectFolders.id,
      { onDelete: "set null" }
    ),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    days: integer("days").notNull().default(30),
    minViews: bigint("min_views", { mode: "number" }).notNull().default(0),
    minScore: integer("min_score").notNull().default(0),
    videoLength: varchar("video_length", { length: 10 })
      .notNull()
      .default("shorts"),
    spendLimitCents: integer("spend_limit_cents"),
    unitsSpent: integer("units_spent").notNull().default(0),
    /** The best-scoring result's thumbnail when the last search finished. */
    coverUrl: text("cover_url"),
    /** Made by "Add a sample project": made-up videos, never searched. */
    isSample: boolean("is_sample").notNull().default(false),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_video_viral_projects_owner_updated").on(
      table.ownerId,
      table.updatedAt
    ),
    check(
      "ck_video_viral_projects_length",
      sql`${table.videoLength} in ('shorts', 'long', 'both')`
    ),
    check("ck_video_viral_projects_days", sql`${table.days} in (7, 30, 90)`),
  ]
)

/**
 * One keyword of one project, and the job that searches it. The status row is
 * the job: Search marks it `queued`, the worker claims it with a lease and
 * takes it to `done` or `failed`, and a restart puts an abandoned claim back.
 */
export const videoViralProjectKeywords = pgTable(
  "video_viral_project_keywords",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => videoViralProjects.id, { onDelete: "cascade" }),
    keyword: varchar("keyword", { length: 100 }).notNull(),
    position: integer("position").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("idle"),
    error: text("error"),
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    ranAt: timestamp("ran_at", { withTimezone: true }),
    unitsSpent: integer("units_spent").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_video_viral_project_keywords_project_keyword").on(
      table.projectId,
      sql`lower(${table.keyword})`
    ),
    index("ix_video_viral_project_keywords_status").on(
      table.status,
      table.queuedAt
    ),
    check(
      "ck_video_viral_project_keywords_status",
      sql`${table.status} in ('idle', 'queued', 'searching', 'done', 'failed')`
    ),
  ]
)

/**
 * One video one keyword found. A keyword's search replaces its own rows and
 * nobody else's. `isNew` is true when the project did not have the video
 * before that search; `topicMatch` is the AI's 0 to 100 for how well the
 * title fits the description, null until asked. Counts a channel hides are
 * null, never zero.
 */
export const videoViralProjectResults = pgTable(
  "video_viral_project_results",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    keywordId: varchar("keyword_id", { length: 36 })
      .notNull()
      .references(() => videoViralProjectKeywords.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => videoViralProjects.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 100 }).notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    channelId: varchar("channel_id", { length: 100 }).notNull(),
    channelName: text("channel_name").notNull(),
    subscribers: bigint("subscribers", { mode: "number" }),
    views: bigint("views", { mode: "number" }).notNull(),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    isNew: boolean("is_new").notNull().default(false),
    topicMatch: integer("topic_match"),
    foundAt: timestamp("found_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_video_viral_project_results_keyword_video").on(
      table.keywordId,
      table.platformVideoId
    ),
    index("ix_video_viral_project_results_project").on(table.projectId),
  ]
)

/** A channel somebody hid from one project. Every other project still shows it. */
export const videoViralProjectHiddenChannels = pgTable(
  "video_viral_project_hidden_channels",
  {
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => videoViralProjects.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    channelId: varchar("channel_id", { length: 100 }).notNull(),
    channelName: text("channel_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.projectId, table.platform, table.channelId],
    }),
  ]
)

/**
 * Which followed creators belong to which project. A creator is stored once,
 * so the watch timer checks them once however many projects they are in.
 */
export const videoViralProjectCreators = pgTable(
  "video_viral_project_creators",
  {
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => videoViralProjects.id, { onDelete: "cascade" }),
    creatorId: varchar("creator_id", { length: 36 })
      .notNull()
      .references(() => videoCreators.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.creatorId] }),
    index("ix_video_viral_project_creators_creator").on(table.creatorId),
  ]
)

/**
 * A video pasted into a project by its link (viral task 08, drizzle/0136).
 * The saved video is its owner's; this row is only why it shows in this
 * project. Deleting the project keeps the saved video.
 */
export const videoViralProjectLinks = pgTable(
  "video_viral_project_links",
  {
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => videoViralProjects.id, { onDelete: "cascade" }),
    savedVideoId: varchar("saved_video_id", { length: 36 })
      .notNull()
      .references(() => videoViralVideos.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.savedVideoId] }),
    index("ix_video_viral_project_links_saved_video").on(table.savedVideoId),
  ]
)

/** A person's favourites collection. Holds videos from any project. */
export const videoViralCollections = pgTable(
  "video_viral_collections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_video_viral_collections_owner_name").on(
      table.ownerId,
      sql`lower(${table.name})`
    ),
  ]
)

/**
 * One starred video. It keeps its own copy of the video's details, so a
 * re-run that replaces a keyword's results, or deleting the project it came
 * from, never empties a collection.
 */
export const videoViralCollectionItems = pgTable(
  "video_viral_collection_items",
  {
    collectionId: varchar("collection_id", { length: 36 })
      .notNull()
      .references(() => videoViralCollections.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 100 }).notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    channelId: varchar("channel_id", { length: 100 }).notNull(),
    channelName: text("channel_name").notNull(),
    subscribers: bigint("subscribers", { mode: "number" }),
    views: bigint("views", { mode: "number" }),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    thumbnailUrl: text("thumbnail_url"),
    sourceProjectId: varchar("source_project_id", { length: 36 }).references(
      () => videoViralProjects.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.collectionId, table.platform, table.platformVideoId],
    }),
  ]
)

/**
 * A brief and the storyboard written from it (`workspace/docs/brief-to-video.md`,
 * drizzle/0129). The scenes, and whatever has been made for each, sit in one
 * list on the row, so the storyboard reopens exactly as it was left and costs
 * nothing to reopen. The lease is the background job's, which makes the
 * scenes one after another and survives a reload or a restart.
 */
export const videoBriefs = pgTable(
  "video_briefs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => videoProjects.id, { onDelete: "cascade" }),
    about: text("about").notNull(),
    audience: text("audience").notNull().default(""),
    lengthSeconds: integer("length_seconds").notNull(),
    platform: varchar("platform", { length: 16 }).$type<BriefPlatform>().notNull(),
    voice: jsonb("voice").$type<BriefVoice>().notNull(),
    pictureModel: varchar("picture_model", { length: 100 }).notNull(),
    title: text("title").notNull(),
    hook: text("hook").notNull(),
    scenes: jsonb("scenes").$type<StoredScene[]>().notNull(),
    // The script check's answer (ai-generation task 01), or why it could not
    // be run. Never both.
    check: jsonb("check").$type<ScriptCheck>(),
    checkError: text("check_error"),
    status: varchar("status", { length: 8 }).$type<BriefStatus>().notNull(),
    // Set when Make it is pressed: where scene one starts, and the lanes the
    // scenes went on once they exist.
    landing: jsonb("landing").$type<BriefLanding>(),
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_video_briefs_project").on(table.projectId, table.createdAt),
    index("ix_video_briefs_status").on(table.status),
    check(
      "video_briefs_status_check",
      sql`${table.status} in ('draft', 'making', 'stopped', 'done')`
    ),
  ]
)

export type VideoBriefRow = typeof videoBriefs.$inferSelect

/**
 * Every YouTube call the app makes, in units. The free 10,000 a day belong to
 * the API key, which is the whole app's, so a run can be refused before it
 * starts when today's spend would not leave room for it.
 */
export const videoYoutubeUnitSpend = pgTable(
  "video_youtube_unit_spend",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    units: integer("units").notNull(),
    reason: varchar("reason", { length: 40 }).notNull(),
    spentAt: timestamp("spent_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ix_video_youtube_unit_spend_spent_at").on(table.spentAt)]
)

export type VideoViralProjectRow = typeof videoViralProjects.$inferSelect
export type VideoViralProjectKeywordRow =
  typeof videoViralProjectKeywords.$inferSelect
export type VideoViralProjectResultRow =
  typeof videoViralProjectResults.$inferSelect
