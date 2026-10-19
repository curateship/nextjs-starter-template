import type { JSONContent } from "@tiptap/core"
import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
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
import type {
  NoteFieldOption,
  NoteFieldType,
  NoteFieldValues,
} from "@/lib/note/notes/fields"
import type { NoteFilter, NoteSort, TotalKind, ViewKind } from "@/lib/note/notes/views"
import type {
  Highlight,
  NotePostKind,
  NotePostStatus,
  PlanStep,
  PostPicture,
  PostVideoStatus,
  QuotedPost,
  ThreadPost,
  ThreadStatus,
} from "@/lib/note/posts/posts"

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

/**
 * Written notes' folders. A folder can sit inside another one, and each has
 * its own fields. The SQL is `drizzle/0098_note_notes.sql`.
 */
export const noteNoteFolders = pgTable(
  "note_note_folders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    parentId: varchar("parent_id", { length: 36 }).references(
      (): AnyPgColumn => noteNoteFolders.id,
      { onDelete: "cascade" }
    ),
    name: varchar("name", { length: 80 }).notNull(),
    icon: varchar("icon", { length: 40 }),
    position: integer("position").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    trashedWithFolderId: varchar("trashed_with_folder_id", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_note_note_folders_owner_parent_name")
      .on(table.ownerId, sql`coalesce(${table.parentId}, '')`, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null`),
    index("ix_note_note_folders_owner").on(table.ownerId),
  ]
)

/** A folder's own fields. Values are stored under `key`, fixed at creation. */
export const noteNoteFields = pgTable(
  "note_note_fields",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    folderId: varchar("folder_id", { length: 36 })
      .notNull()
      .references(() => noteNoteFolders.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 60 }).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    type: varchar("type", { length: 20 }).$type<NoteFieldType>().notNull(),
    options: jsonb("options").$type<NoteFieldOption[]>().notNull().default([]),
    remind: boolean("remind").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_note_note_fields_folder_key").on(table.folderId, table.key),
    uniqueIndex("ux_note_note_fields_folder_name").on(table.folderId, sql`lower(${table.name})`),
  ]
)

/** One written note. The body is the editor's JSON document, never HTML. */
export const noteNotes = pgTable(
  "note_notes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    folderId: varchar("folder_id", { length: 36 }).references(() => noteNoteFolders.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 200 }).notNull().default(""),
    icon: varchar("icon", { length: 40 }),
    coverUrl: text("cover_url"),
    body: jsonb("body").$type<JSONContent>().notNull(),
    bodyText: text("body_text").notNull().default(""),
    firstLine: varchar("first_line", { length: 200 }).notNull().default(""),
    checklistDone: integer("checklist_done").notNull().default(0),
    checklistTotal: integer("checklist_total").notNull().default(0),
    words: integer("words").notNull().default(0),
    fieldValues: jsonb("field_values").$type<NoteFieldValues>().notNull().default({}),
    fieldsText: text("fields_text").notNull().default(""),
    videoId: varchar("video_id", { length: 36 }).references(() => noteVideos.id, {
      onDelete: "set null",
    }),
    videoTitle: text("video_title"),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    trashedWithFolderId: varchar("trashed_with_folder_id", { length: 36 }),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_note_notes_owner_folder").on(table.ownerId, table.folderId, table.updatedAt),
  ]
)

/** A folder's templates: what a new note starts with. */
export const noteNoteTemplates = pgTable("note_note_templates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  folderId: varchar("folder_id", { length: 36 })
    .notNull()
    .references(() => noteNoteFolders.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  title: varchar("title", { length: 200 }).notNull().default(""),
  body: jsonb("body").$type<JSONContent>().notNull(),
  fieldValues: jsonb("field_values").$type<NoteFieldValues>().notNull().default({}),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

/** A folder's saved views. */
export const noteNoteViews = pgTable("note_note_views", {
  id: varchar("id", { length: 36 }).primaryKey(),
  folderId: varchar("folder_id", { length: 36 })
    .notNull()
    .references(() => noteNoteFolders.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 60 }).notNull(),
  kind: varchar("kind", { length: 10 }).$type<ViewKind>().notNull(),
  filters: jsonb("filters").$type<NoteFilter[]>().notNull().default([]),
  sort: jsonb("sort").$type<NoteSort | null>(),
  groupBy: varchar("group_by", { length: 60 }),
  totals: jsonb("totals").$type<Record<string, TotalKind>>().notNull().default({}),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

/** Earlier copies of a note. */
export const noteNoteVersions = pgTable(
  "note_note_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    noteId: varchar("note_id", { length: 36 })
      .notNull()
      .references(() => noteNotes.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull().default(""),
    body: jsonb("body").$type<JSONContent>().notNull(),
    fieldValues: jsonb("field_values").$type<NoteFieldValues>().notNull().default({}),
    words: integer("words").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ix_note_note_versions_note").on(table.noteId, table.createdAt)]
)

/** Which note links to which. */
export const noteNoteLinks = pgTable(
  "note_note_links",
  {
    fromNoteId: varchar("from_note_id", { length: 36 })
      .notNull()
      .references(() => noteNotes.id, { onDelete: "cascade" }),
    toNoteId: varchar("to_note_id", { length: 36 })
      .notNull()
      .references(() => noteNotes.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.fromNoteId, table.toNoteId] }),
    index("ix_note_note_links_to").on(table.toNoteId),
  ]
)

/** A date reminder, sent once. */
export const noteNoteReminders = pgTable(
  "note_note_reminders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    noteId: varchar("note_id", { length: 36 })
      .notNull()
      .references(() => noteNotes.id, { onDelete: "cascade" }),
    fieldKey: varchar("field_key", { length: 60 }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("ux_note_note_reminders_note_field").on(table.noteId, table.fieldKey)]
)

/**
 * Posts' folders: a flat list with no fields, kept apart from the Videos
 * folders. The SQL is `drizzle/0100_note_posts.sql`.
 */
export const notePostFolders = pgTable(
  "note_post_folders",
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
    uniqueIndex("ux_note_post_folders_owner_name").on(table.ownerId, sql`lower(${table.name})`),
  ]
)

/**
 * One saved X post and everything the AI wrote about it, or one plan merged
 * from several (kind "merged"). The status is the job and the lease says which
 * worker holds it; the post's video has a status of its own.
 */
export const notePosts = pgTable(
  "note_posts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    folderId: varchar("folder_id", { length: 36 }).references(() => notePostFolders.id, {
      onDelete: "set null",
    }),
    kind: varchar("kind", { length: 10 }).$type<NotePostKind>().notNull().default("post"),
    postId: varchar("post_id", { length: 30 }),
    url: text("url"),
    status: varchar("status", { length: 20 }).$type<NotePostStatus>().notNull(),
    error: text("error"),
    authorName: text("author_name"),
    authorHandle: varchar("author_handle", { length: 30 }),
    authorPicturePath: text("author_picture_path"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    text: text("text"),
    pictures: jsonb("pictures").$type<PostPicture[]>(),
    quoted: jsonb("quoted").$type<QuotedPost>(),
    thread: jsonb("thread").$type<ThreadPost[]>(),
    threadStatus: varchar("thread_status", { length: 10 }).$type<ThreadStatus>().notNull().default("none"),
    articleUrl: text("article_url"),
    articleTitle: text("article_title"),
    articleText: text("article_text"),
    likesWhenSaved: integer("likes_when_saved"),
    repostsWhenSaved: integer("reposts_when_saved"),
    videoStatus: varchar("video_status", { length: 20 }).$type<PostVideoStatus>().notNull().default("none"),
    videoError: text("video_error"),
    videoSourceUrl: text("video_source_url"),
    videoSeconds: integer("video_seconds"),
    videoMediaId: varchar("video_media_id", { length: 36 }).references(() => customShellMedia.id, {
      onDelete: "set null",
    }),
    videoCoverPath: text("video_cover_path"),
    transcript: jsonb("transcript").$type<TranscriptLine[]>(),
    highlights: jsonb("highlights").$type<Highlight[]>(),
    summary: jsonb("summary").$type<string[]>(),
    actionPlan: jsonb("action_plan").$type<PlanStep[]>(),
    tags: jsonb("tags").$type<string[]>(),
    suggestedFolderId: varchar("suggested_folder_id", { length: 36 }).references(
      () => notePostFolders.id,
      { onDelete: "set null" }
    ),
    similarPostId: varchar("similar_post_id", { length: 36 }).references(
      (): AnyPgColumn => notePosts.id,
      { onDelete: "set null" }
    ),
    sourcePostIds: jsonb("source_post_ids").$type<string[]>(),
    analysedAt: timestamp("analysed_at", { withTimezone: true }),
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_note_posts_owner_post")
      .on(table.ownerId, table.postId)
      .where(sql`${table.postId} is not null`),
    index("ix_note_posts_status").on(table.status, table.updatedAt),
    index("ix_note_posts_owner_created").on(table.ownerId, table.createdAt),
    check("ck_note_posts_kind", sql`${table.kind} in ('post', 'merged')`),
    check(
      "ck_note_posts_status",
      sql`${table.status} in ('waiting', 'reading', 'saved', 'queued', 'analysing', 'ready', 'failed')`
    ),
    check(
      "ck_note_posts_video_status",
      sql`${table.videoStatus} in ('none', 'waiting', 'downloading', 'saved', 'failed', 'too_long')`
    ),
    check("ck_note_posts_thread_status", sql`${table.threadStatus} in ('none', 'whole', 'cut')`),
  ]
)

/** The app's own settings, one row keyed "app". */
export const noteSettings = pgTable("note_settings", {
  key: varchar("key", { length: 20 }).primaryKey(),
  aboutYou: text("about_you").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

/**
 * Which video, note or post a bell notice is about, so clicking it opens that
 * one. Exactly one of the three is set.
 */
export const noteNoticeLinks = pgTable("note_notice_links", {
  noticeId: varchar("notice_id", { length: 36 })
    .primaryKey()
    .references(() => customShellNotifications.id, { onDelete: "cascade" }),
  videoId: varchar("video_id", { length: 36 }).references(() => noteVideos.id, {
    onDelete: "cascade",
  }),
  noteId: varchar("note_id", { length: 36 }).references(() => noteNotes.id, {
    onDelete: "cascade",
  }),
  postId: varchar("post_id", { length: 36 }).references(() => notePosts.id, {
    onDelete: "cascade",
  }),
})

export type NoteVideoRow = typeof noteVideos.$inferSelect
export type NoteFolderRow = typeof noteFolders.$inferSelect
export type NoteNoteFolderRow = typeof noteNoteFolders.$inferSelect
export type NoteNoteFieldRow = typeof noteNoteFields.$inferSelect
export type NoteNoteRow = typeof noteNotes.$inferSelect
export type NotePostRow = typeof notePosts.$inferSelect
export type NotePostFolderRow = typeof notePostFolders.$inferSelect
