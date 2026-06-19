import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core"

export const aiVideoUsers = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const aiVideoSessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_sessions_user_id").on(table.userId),
    index("ix_sessions_token_hash").on(table.tokenHash),
    index("ix_sessions_expires_at").on(table.expiresAt),
  ]
)

export const aiVideoSettings = pgTable(
  "settings",
  {
    key: text("key").primaryKey(),
    settings: jsonb("settings").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("settings_default_key", sql`${table.key} = 'default'`),
  ]
)

// App-wide LLM provider API keys (one row per provider). Server-only secrets —
// never sent to the client; the settings UI only sees a masked tail.
export const aiVideoLlmApiKeys = pgTable(
  "llm_api_keys",
  {
    provider: varchar("provider", { length: 20 }).primaryKey(),
    apiKey: text("api_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "llm_provider_valid",
      sql`${table.provider} IN ('openai', 'claude', 'gemini', 'elevenlabs')`
    ),
  ]
)

export const aiVideoWorkspaces = pgTable(
  "workspaces",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    settings: jsonb("settings").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_workspaces_user_id").on(table.userId),
  ]
)

export const aiVideoFeedback = pgTable(
  "feedback",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "feedback_type_check",
      sql`${table.type} in ('suggestion', 'bug_report', 'question', 'praise')`
    ),
    index("ix_feedback_user_id").on(table.userId),
    index("ix_feedback_type").on(table.type),
  ]
)

export const aiVideoFeedbackVotes = pgTable(
  "feedback_votes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => aiVideoFeedback.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("feedback_votes_unique_user").on(
      table.feedbackId,
      table.userId
    ),
    index("ix_feedback_votes_feedback_id").on(table.feedbackId),
    index("ix_feedback_votes_user_id").on(table.userId),
  ]
)

export const aiVideoFeedbackComments = pgTable(
  "feedback_comments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => aiVideoFeedback.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_feedback_comments_feedback_id").on(table.feedbackId),
    index("ix_feedback_comments_user_id").on(table.userId),
    index("ix_feedback_comments_created_at").on(table.createdAt),
  ]
)

export const aiVideoNotifications = pgTable(
  "notifications",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    recipientUserId: varchar("recipient_user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    actorUserId: varchar("actor_user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => aiVideoFeedback.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    feedbackVoteId: varchar("feedback_vote_id", { length: 36 }).references(
      () => aiVideoFeedbackVotes.id,
      { onDelete: "cascade" }
    ),
    feedbackCommentId: varchar("feedback_comment_id", {
      length: 36,
    }).references(() => aiVideoFeedbackComments.id, {
      onDelete: "cascade",
    }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "notifications_type_check",
      sql`${table.type} in ('feedback_vote', 'feedback_comment')`
    ),
    index("ix_notifications_recipient_created").on(
      table.recipientUserId,
      table.createdAt
    ),
    index("ix_notifications_feedback_id").on(table.feedbackId),
    index("ix_notifications_vote_id").on(table.feedbackVoteId),
    index("ix_notifications_comment_id").on(
      table.feedbackCommentId
    ),
  ]
)

export const aiVideoMedia = pgTable(
  "media",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 255 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    altText: text("alt_text"),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    fileType: varchar("file_type", { length: 20 }).notNull(),
    storagePath: text("storage_path").notNull().unique(),
    projectId: varchar("project_id", { length: 36 }).references(
      () => aiVideoProjects.id,
      { onDelete: "cascade" }
    ),
    source: varchar("source", { length: 20 }).notNull().default("upload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "media_file_type_check",
      sql`${table.fileType} in ('image', 'video', 'audio')`
    ),
    check(
      "media_source_check",
      sql`${table.source} in ('upload', 'generated', 'template', 'viral')`
    ),
    index("ix_media_user_id").on(table.userId),
    index("ix_media_project_id").on(table.projectId),
    index("ix_media_source").on(table.source),
    index("ix_media_file_type").on(table.fileType),
    index("ix_media_created_at").on(table.createdAt),
    index("ix_media_user_type_created").on(
      table.userId,
      table.fileType,
      table.createdAt
    ),
    index("ix_media_project_source_type_created").on(
      table.projectId,
      table.source,
      table.fileType,
      table.createdAt
    ),
  ]
)

export const aiVideoActors = pgTable(
  "actors",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    prompt: text("prompt").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    tags: jsonb("tags").notNull(),
    referenceMediaId: varchar("reference_media_id", { length: 36 }).references(
      () => aiVideoMedia.id,
      { onDelete: "set null" }
    ),
    imageStoragePath: text("image_storage_path").notNull().unique(),
    imageMimeType: varchar("image_mime_type", { length: 255 }).notNull(),
    imageFileSize: bigint("image_file_size", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "actors_status_check",
      sql`${table.status} in ('active', 'inactive')`
    ),
    index("ix_actors_user_id").on(table.userId),
    index("ix_actors_status").on(table.status),
    index("ix_actors_created_at").on(table.createdAt),
    index("ix_actors_user_status_created").on(
      table.userId,
      table.status,
      table.createdAt
    ),
    index("ix_actors_reference_media_id").on(table.referenceMediaId),
  ]
)

export const aiVideoProjects = pgTable(
  "video_projects",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    // Set when the project was created via "Use template" — the script writer
    // follows it to the template's source reel analysis.
    templateId: varchar("template_id", { length: 36 }).references(
      () => aiVideoTemplates.id,
      { onDelete: "set null" }
    ),
    // Serialized editor timeline: { tracks: EditorTrack[], aspect: AspectRatio }
    timeline: jsonb("timeline").notNull(),
    // Latest export: rendering → ready/error; the MP4 lives at renderStoragePath.
    renderStatus: varchar("render_status", { length: 20 }),
    renderError: text("render_error"),
    renderStoragePath: varchar("render_storage_path", { length: 500 }),
    renderedAt: timestamp("rendered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "video_projects_render_status_check",
      sql`${table.renderStatus} in ('rendering', 'ready', 'error')`
    ),
    index("ix_video_projects_user_id").on(table.userId),
    index("ix_video_projects_user_created").on(table.userId, table.createdAt),
    index("ix_video_projects_template_id").on(table.templateId),
  ]
)

export const aiVideoCreators = pgTable(
  "creators",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 20 }).notNull(),
    // Stable lowercased platform handle — the upsert key for matching new reels.
    username: varchar("username", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 255 }),
    // R2 path of the fetched profile picture (best-effort, may stay null).
    avatarStoragePath: varchar("avatar_storage_path", { length: 500 }),
    // Watched creators get their newest reels auto-ingested by the watcher.
    watch: boolean("watch").notNull().default(false),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "creators_platform_check",
      sql`${table.platform} in ('tiktok', 'instagram')`
    ),
    unique("creators_user_platform_username_unique").on(
      table.userId,
      table.platform,
      table.username
    ),
    index("ix_creators_user_id").on(table.userId),
  ]
)

export const aiVideoViralVideos = pgTable(
  "viral_videos",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    platform: varchar("platform", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    error: text("error"),
    // The downloaded reel, ingested as a regular media row.
    mediaId: varchar("media_id", { length: 36 }).references(
      () => aiVideoMedia.id,
      { onDelete: "set null" }
    ),
    title: varchar("title", { length: 500 }),
    author: varchar("author", { length: 255 }),
    durationMs: integer("duration_ms"),
    // Engagement metadata from the platform: { views, likes, comments, postedAt }
    stats: jsonb("stats"),
    // Gemini breakdown: { transcript: [...], segments: [...], scenes: [...] }
    analysis: jsonb("analysis"),
    // R2 path for the cover-frame JPEG extracted by ffmpeg at ~1s.
    thumbnailStoragePath: varchar("thumbnail_storage_path", { length: 500 }),
    // The reel's creator, upserted from yt-dlp metadata during processing.
    creatorId: varchar("creator_id", { length: 36 }).references(
      () => aiVideoCreators.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "viral_videos_platform_check",
      sql`${table.platform} in ('tiktok', 'instagram')`
    ),
    check(
      "viral_videos_status_check",
      sql`${table.status} in ('downloading', 'analyzing', 'ready', 'error')`
    ),
    index("ix_viral_videos_user_id").on(table.userId),
    index("ix_viral_videos_user_created").on(table.userId, table.createdAt),
    index("ix_viral_videos_media_id").on(table.mediaId),
    index("ix_viral_videos_creator_id").on(table.creatorId),
  ]
)

export const aiVideoTemplates = pgTable(
  "video_templates",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    sourceViralVideoId: varchar("source_viral_video_id", {
      length: 36,
    }).references(() => aiVideoViralVideos.id, { onDelete: "set null" }),
    // Template-owned copy of the source reel's thumbnail (R2 path), so the card
    // survives deletion of the source reel/creator. Null for pre-migration rows.
    thumbnailStoragePath: text("thumbnail_storage_path"),
    // Editor timeline with replaceable slot clips: { tracks, aspect }
    timeline: jsonb("timeline").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_video_templates_user_id").on(table.userId),
    index("ix_video_templates_user_created").on(table.userId, table.createdAt),
  ]
)

export const aiVideoActorGenerationEvents = pgTable(
  "actor_generation_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_actor_generation_events_user_created").on(
      table.userId,
      table.createdAt
    ),
    index("ix_actor_generation_events_created_at").on(table.createdAt),
  ]
)

export type AiVideoUser = typeof aiVideoUsers.$inferSelect
export type AiVideoWorkspace = typeof aiVideoWorkspaces.$inferSelect
export type AiVideoMedia = typeof aiVideoMedia.$inferSelect
export type AiVideoActor = typeof aiVideoActors.$inferSelect
export type AiVideoProject = typeof aiVideoProjects.$inferSelect
export type AiVideoCreator = typeof aiVideoCreators.$inferSelect
export type AiVideoViralVideo = typeof aiVideoViralVideos.$inferSelect
export type AiVideoTemplate = typeof aiVideoTemplates.$inferSelect
export type AiVideoFeedback = typeof aiVideoFeedback.$inferSelect
export type AiVideoFeedbackComment =
  typeof aiVideoFeedbackComments.$inferSelect
export type AiVideoNotification =
  typeof aiVideoNotifications.$inferSelect
