import type { JSONContent } from "@tiptap/core"
import { sql } from "drizzle-orm"
import {
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

import { customShellMedia, customShellNotifications, customShellUsers } from "@/server/schema"
import type { Highlight } from "@/lib/note/library/highlights"
import type {
  AnalyseStatus,
  ImportSource,
  ImportStatus,
  LibraryColour,
  NoteFilters,
  NotePriority,
  NoteSource,
  PinnedRow,
  PlanStep,
  PostPicture,
  PostVideoStatus,
  Quote,
  QuotedPost,
  ThreadPost,
  ThreadStatus,
  TranscriptLine,
} from "@/lib/note/library/notes"

/**
 * The Note app's own tables, kept apart from the shell's `src/server/schema.ts`
 * on purpose: that file belongs to the shell, and editing it would fork this
 * app off every future shell merge. The SQL is `drizzle/0102_note_library.sql`.
 *
 * Since 20 Oct 2026 there is one kind of record, the note, kept in one of its
 * owner's libraries. A note written by hand and one imported from a link are
 * the same row; an import fills the columns about where it came from.
 */

/** One person's library: a name, a colour, and the banner and picture it shows. */
export const noteLibraries = pgTable(
  "note_libraries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description").notNull().default(""),
    colour: varchar("colour", { length: 20 }).$type<LibraryColour>().notNull().default("slate"),
    avatarUrl: text("avatar_url"),
    bannerUrl: text("banner_url"),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    /** The LIBRARY card's rows pinned to its Pinned card, each with when. */
    pinnedRows: jsonb("pinned_rows").$type<PinnedRow[]>().notNull().default([]),
    /** When its dashboard was last opened, which the Save to Note button saves into. */
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("ux_note_libraries_owner_name").on(table.ownerId, sql`lower(${table.name})`)]
)

/**
 * A library's folders, one level only. An import files its note in the
 * folder made for its source, found by `source` so renaming it keeps it.
 */
export const noteFolders = pgTable(
  "note_folders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    libraryId: varchar("library_id", { length: 36 })
      .notNull()
      .references(() => noteLibraries.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    source: varchar("source", { length: 20 }).$type<ImportSource>(),
    position: integer("position").notNull().default(0),
    /** Pinned to the Pinned card above LIBRARY. Empty means not pinned. */
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_note_folders_library_name").on(table.libraryId, sql`lower(${table.name})`),
    uniqueIndex("ux_note_folders_library_source")
      .on(table.libraryId, table.source)
      .where(sql`${table.source} is not null`),
  ]
)

/**
 * One note. The body is the editor's JSON document, never HTML. An imported
 * note also holds its link, its author, the saved video or the X post's
 * words, and the AI's cards. `import_status` and `analyse_status` are the
 * worker's jobs, and the lease says which worker holds the row.
 */
export const noteNotes = pgTable(
  "note_notes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    ownerId: varchar("owner_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    libraryId: varchar("library_id", { length: 36 })
      .notNull()
      .references(() => noteLibraries.id, { onDelete: "cascade" }),
    folderId: varchar("folder_id", { length: 36 }).references(() => noteFolders.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull().default(""),
    body: jsonb("body").$type<JSONContent>().notNull(),
    bodyText: text("body_text").notNull().default(""),
    words: integer("words").notNull().default(0),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    priority: varchar("priority", { length: 10 }).$type<NotePriority>().notNull().default("normal"),
    source: varchar("source", { length: 20 }).$type<NoteSource>().notNull().default("note"),
    sourceUrl: text("source_url"),
    /** The site's own id for the video, or X's number for the post. */
    platformId: varchar("platform_id", { length: 200 }),
    importStatus: varchar("import_status", { length: 20 }).$type<ImportStatus>(),
    importError: text("import_error"),
    analyseStatus: varchar("analyse_status", { length: 20 }).$type<AnalyseStatus>(),
    analyseError: text("analyse_error"),
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    /** The saved video: a video import's own, or an X post's. */
    videoMediaId: varchar("video_media_id", { length: 36 }).references(() => customShellMedia.id, {
      onDelete: "set null",
    }),
    mediaKind: varchar("media_kind", { length: 10 }).$type<"video" | "audio">(),
    coverPath: text("cover_path"),
    durationSeconds: integer("duration_seconds"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    language: varchar("language", { length: 20 }),
    authorName: text("author_name"),
    authorHandle: varchar("author_handle", { length: 100 }),
    authorPicturePath: text("author_picture_path"),
    postText: text("post_text"),
    pictures: jsonb("pictures").$type<PostPicture[]>(),
    quoted: jsonb("quoted").$type<QuotedPost>(),
    thread: jsonb("thread").$type<ThreadPost[]>(),
    threadStatus: varchar("thread_status", { length: 10 }).$type<ThreadStatus>().notNull().default("none"),
    likesWhenSaved: integer("likes_when_saved"),
    repostsWhenSaved: integer("reposts_when_saved"),
    videoStatus: varchar("video_status", { length: 20 }).$type<PostVideoStatus>().notNull().default("none"),
    videoError: text("video_error"),
    videoSourceUrl: text("video_source_url"),
    highlights: jsonb("highlights").$type<Highlight[]>(),
    transcript: jsonb("transcript").$type<TranscriptLine[]>(),
    transcriptText: text("transcript_text"),
    summary: jsonb("summary").$type<string[]>(),
    actionPlan: jsonb("action_plan").$type<PlanStep[]>(),
    quotes: jsonb("quotes").$type<Quote[]>(),
    analysedAt: timestamp("analysed_at", { withTimezone: true }),
    /** One plan from many: the notes its plan was written from. */
    mergedFrom: jsonb("merged_from").$type<string[]>(),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    /** Where the saved video or sound was stopped, in whole seconds. Empty means from the start. */
    playedSeconds: integer("played_seconds"),
    revision: integer("revision").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_note_notes_library").on(table.libraryId, table.deletedAt, table.updatedAt),
    index("ix_note_notes_import").on(table.importStatus, table.updatedAt),
    index("ix_note_notes_analyse").on(table.analyseStatus, table.updatedAt),
    index("ix_note_notes_trash").on(table.deletedAt).where(sql`${table.deletedAt} is not null`),
    uniqueIndex("ux_note_notes_library_link")
      .on(table.libraryId, table.source, table.platformId)
      .where(sql`${table.platformId} is not null`),
    check("ck_note_notes_priority", sql`${table.priority} in ('high', 'normal', 'low')`),
    check(
      "ck_note_notes_source",
      sql`${table.source} in ('note', 'youtube_long', 'youtube_short', 'instagram', 'tiktok', 'x', 'threads', 'linkedin', 'facebook', 'reddit')`
    ),
    check(
      "ck_note_notes_import_status",
      sql`${table.importStatus} in ('waiting', 'reading', 'downloading', 'saved', 'failed')`
    ),
    check(
      "ck_note_notes_analyse_status",
      sql`${table.analyseStatus} in ('queued', 'transcribing', 'summarising', 'ready', 'failed')`
    ),
    check(
      "ck_note_notes_video_status",
      sql`${table.videoStatus} in ('none', 'waiting', 'downloading', 'saved', 'failed', 'too_long')`
    ),
    check("ck_note_notes_thread_status", sql`${table.threadStatus} in ('none', 'whole', 'cut')`),
  ]
)

/** A library's templates: what a new note starts with. */
export const noteTemplates = pgTable("note_templates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  libraryId: varchar("library_id", { length: 36 })
    .notNull()
    .references(() => noteLibraries.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  title: varchar("title", { length: 200 }).notNull().default(""),
  body: jsonb("body").$type<JSONContent>().notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

/** A library's saved views: a name and a set of filters. */
export const noteViews = pgTable(
  "note_views",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    libraryId: varchar("library_id", { length: 36 })
      .notNull()
      .references(() => noteLibraries.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    filters: jsonb("filters").$type<NoteFilters>().notNull().default({}),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("ux_note_views_library_name").on(table.libraryId, sql`lower(${table.name})`)]
)

/** Earlier copies of a note's title and text. */
export const noteVersions = pgTable(
  "note_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    noteId: varchar("note_id", { length: 36 })
      .notNull()
      .references(() => noteNotes.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull().default(""),
    body: jsonb("body").$type<JSONContent>().notNull(),
    words: integer("words").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ix_note_versions_note").on(table.noteId, table.createdAt)]
)

/** Which note links to which. Both are in the same library. */
export const noteLinks = pgTable(
  "note_links",
  {
    fromNoteId: varchar("from_note_id", { length: 36 })
      .notNull()
      .references(() => noteNotes.id, { onDelete: "cascade" }),
    toNoteId: varchar("to_note_id", { length: 36 })
      .notNull()
      .references(() => noteNotes.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.fromNoteId, table.toNoteId] }), index("ix_note_links_to").on(table.toNoteId)]
)

/** The app's own settings, one row keyed "app". */
export const noteSettings = pgTable("note_settings", {
  key: varchar("key", { length: 20 }).primaryKey(),
  aboutYou: text("about_you").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

/** Which note a bell notice is about, so clicking it opens that one. */
export const noteNoticeLinks = pgTable("note_notice_links", {
  noticeId: varchar("notice_id", { length: 36 })
    .primaryKey()
    .references(() => customShellNotifications.id, { onDelete: "cascade" }),
  noteId: varchar("note_id", { length: 36 })
    .notNull()
    .references(() => noteNotes.id, { onDelete: "cascade" }),
})

export type NoteLibraryRow = typeof noteLibraries.$inferSelect
export type NoteRow = typeof noteNotes.$inferSelect
