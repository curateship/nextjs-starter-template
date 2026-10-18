import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

import {
  customShellMedia,
  customShellNotifications,
  customShellUsers,
} from "@/server/schema"
import type {
  ActionStep,
  NoteVideoKind,
  NoteVideoStatus,
  Quote,
  TranscriptLine,
} from "@/lib/note/videos"

/**
 * The Note app's own tables, kept apart from the shell's `src/server/schema.ts`
 * on purpose: that file belongs to the shell, and editing it would fork this
 * app off every future shell merge. The SQL is `drizzle/0096_note_videos.sql`.
 */

/** A flat list of folders, one person's own, in the order they dragged. */
export const noteFolders = pgTable(
  "note_folders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_note_folders_owner_name").on(
      table.ownerId,
      sql`lower(${table.name})`
    ),
  ]
)

/**
 * One saved video or sound file and everything the AI wrote about it. The
 * status is the job, and the lease says which worker holds it.
 */
export const noteVideos = pgTable(
  "note_videos",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    folderId: varchar("folder_id", { length: 36 }).references(
      () => noteFolders.id,
      { onDelete: "set null" }
    ),
    source: varchar("source", { length: 60 }).notNull(),
    /** Null for a file uploaded from the computer. */
    sourceUrl: text("source_url"),
    /** Null until yt-dlp names a link from anywhere other than the three sites. */
    platformVideoId: varchar("platform_video_id", { length: 200 }),
    kind: varchar("kind", { length: 10 }).$type<NoteVideoKind>().notNull(),
    status: varchar("status", { length: 20 }).$type<NoteVideoStatus>().notNull(),
    error: text("error"),
    /** The stored file, once it is in the shell's library. */
    mediaId: varchar("media_id", { length: 36 }).references(
      () => customShellMedia.id,
      { onDelete: "set null" }
    ),
    coverStoragePath: text("cover_storage_path"),
    title: text("title"),
    channelName: text("channel_name"),
    durationSeconds: integer("duration_seconds"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    language: varchar("language", { length: 20 }),
    transcript: jsonb("transcript").$type<TranscriptLine[]>(),
    transcriptText: text("transcript_text"),
    summary: jsonb("summary").$type<string[]>(),
    actionPlan: jsonb("action_plan").$type<ActionStep[]>(),
    quotes: jsonb("quotes").$type<Quote[]>(),
    tags: jsonb("tags").$type<string[]>(),
    note: text("note"),
    analysedAt: timestamp("analysed_at", { withTimezone: true }),
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_note_videos_owner_source_video")
      .on(table.ownerId, table.source, table.platformVideoId)
      .where(sql`${table.platformVideoId} is not null`),
    uniqueIndex("ux_note_videos_media")
      .on(table.mediaId)
      .where(sql`${table.mediaId} is not null`),
    index("ix_note_videos_status").on(table.status, table.updatedAt),
    index("ix_note_videos_owner_created").on(table.ownerId, table.createdAt),
    check(
      "ck_note_videos_status",
      sql`${table.status} in ('waiting', 'downloading', 'saved', 'queued', 'transcribing', 'summarising', 'ready', 'failed')`
    ),
    check("ck_note_videos_kind", sql`${table.kind} in ('video', 'audio')`),
  ]
)

/** Which video a bell notice is about, so clicking it opens that video. */
export const noteNoticeLinks = pgTable("note_notice_links", {
  noticeId: varchar("notice_id", { length: 36 })
    .primaryKey()
    .references(() => customShellNotifications.id, { onDelete: "cascade" }),
  videoId: varchar("video_id", { length: 36 })
    .notNull()
    .references(() => noteVideos.id, { onDelete: "cascade" }),
})

export type NoteVideoRow = typeof noteVideos.$inferSelect
export type NoteFolderRow = typeof noteFolders.$inferSelect
