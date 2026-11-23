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
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

export const aiVideoUsers = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  // Per-type bell notification toggles as { [notificationType]: boolean }.
  // Null / missing key = the default (on); see @/server/notification-preferences.
  notificationPreferences: jsonb("notification_preferences"),
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

export const aiVideoLoginRateLimits = pgTable("login_rate_limits", {
  key: varchar("key", { length: 64 }).primaryKey(),
  failures: jsonb("failures").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const aiVideoSettings = pgTable(
  "settings",
  {
    key: text("key").primaryKey(),
    settings: jsonb("settings").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [check("settings_default_key", sql`${table.key} = 'default'`)]
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

export const aiVideoApiUsageLimits = pgTable(
  "api_usage_limits",
  {
    key: varchar("key", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).references(
      () => aiVideoUsers.id,
      { onDelete: "cascade" }
    ),
    monthlyCredits: integer("monthly_credits").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("api_usage_limits_positive", sql`${table.monthlyCredits} > 0`),
    index("ix_api_usage_limits_user_id").on(table.userId),
    unique("api_usage_limits_user_unique").on(table.userId),
  ]
)

export const aiVideoApiUsageEvents = pgTable(
  "api_usage_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).notNull(),
    feature: varchar("feature", { length: 40 }).notNull(),
    model: varchar("model", { length: 100 }),
    credits: integer("credits").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "api_usage_provider_check",
      sql`${table.provider} in ('gemini', 'openai', 'veo', 'elevenlabs')`
    ),
    check(
      "api_usage_feature_check",
      sql`${table.feature} in ('text_generation', 'caption_generation', 'video_analysis', 'voiceover', 'image_generation', 'ai_video_generation', 'script_generation', 'carousel_generation', 'export_description', 'jump_cut_analysis')`
    ),
    check(
      "api_usage_status_check",
      sql`${table.status} in ('success', 'failed', 'blocked')`
    ),
    check("api_usage_credits_positive", sql`${table.credits} > 0`),
    index("ix_api_usage_events_user_period").on(
      table.userId,
      table.periodStart
    ),
    index("ix_api_usage_events_period_created").on(
      table.periodStart,
      table.createdAt
    ),
    index("ix_api_usage_events_provider").on(table.provider),
    index("ix_api_usage_events_feature").on(table.feature),
  ]
)

export const aiVideoApiUsageAlerts = pgTable(
  "api_usage_alerts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    level: varchar("level", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "api_usage_alert_level_check",
      sql`${table.level} in ('warning', 'blocked')`
    ),
    unique("api_usage_alerts_user_period_level_unique").on(
      table.userId,
      table.periodStart,
      table.level
    ),
    index("ix_api_usage_alerts_user_period").on(
      table.userId,
      table.periodStart
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
  (table) => [index("ix_workspaces_user_id").on(table.userId)]
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
    unique("feedback_votes_unique_user").on(table.feedbackId, table.userId),
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
    feedbackId: varchar("feedback_id", { length: 36 }).references(
      () => aiVideoFeedback.id,
      { onDelete: "cascade" }
    ),
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
    creatorId: varchar("creator_id", { length: 36 }).references(
      () => aiVideoCreators.id,
      { onDelete: "cascade" }
    ),
    creatorNewVideoCount: integer("creator_new_video_count"),
    // Automation run parked at (or auto-rejected by) an approval checkpoint.
    automationRunId: varchar("automation_run_id", { length: 36 }).references(
      () => aiVideoAutomationRuns.id,
      { onDelete: "cascade" }
    ),
    automationApprovalState: varchar("automation_approval_state", {
      length: 20,
    }),
    apiUsageLevel: varchar("api_usage_level", { length: 20 }),
    apiUsagePeriodStart: timestamp("api_usage_period_start", {
      withTimezone: true,
    }),
    apiUsageUsedCredits: integer("api_usage_used_credits"),
    apiUsageLimitCredits: integer("api_usage_limit_credits"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "notifications_type_check",
      sql`${table.type} in ('feedback_vote', 'feedback_comment', 'creator_watch', 'api_usage_alert', 'automation_approval')`
    ),
    check(
      "notifications_automation_approval_state_check",
      sql`${table.automationApprovalState} is null or ${table.automationApprovalState} in ('pending', 'timed_out')`
    ),
    index("ix_notifications_recipient_created").on(
      table.recipientUserId,
      table.createdAt
    ),
    index("ix_notifications_feedback_id").on(table.feedbackId),
    index("ix_notifications_vote_id").on(table.feedbackVoteId),
    index("ix_notifications_comment_id").on(table.feedbackCommentId),
    index("ix_notifications_creator_id").on(table.creatorId),
    index("ix_notifications_automation_run_id").on(table.automationRunId),
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
    proxyStatus: varchar("proxy_status", { length: 20 }),
    proxyProfile: varchar("proxy_profile", { length: 20 }),
    proxyStoragePath: text("proxy_storage_path").unique(),
    proxyFileSize: bigint("proxy_file_size", { mode: "number" }),
    proxyError: text("proxy_error"),
    proxyAttempts: integer("proxy_attempts").notNull().default(0),
    proxyLeaseToken: varchar("proxy_lease_token", { length: 36 }),
    proxyLeaseExpiresAt: timestamp("proxy_lease_expires_at", {
      withTimezone: true,
    }),
    proxyStartedAt: timestamp("proxy_started_at", { withTimezone: true }),
    proxyGeneratedAt: timestamp("proxy_generated_at", { withTimezone: true }),
    filmstripStatus: varchar("filmstrip_status", { length: 20 }),
    filmstripProfile: varchar("filmstrip_profile", { length: 20 }),
    filmstripStoragePath: text("filmstrip_storage_path").unique(),
    filmstripFrameCount: integer("filmstrip_frame_count"),
    filmstripFrameWidth: integer("filmstrip_frame_width"),
    filmstripFrameHeight: integer("filmstrip_frame_height"),
    filmstripColumns: integer("filmstrip_columns"),
    filmstripDurationMs: integer("filmstrip_duration_ms"),
    filmstripError: text("filmstrip_error"),
    filmstripAttempts: integer("filmstrip_attempts").notNull().default(0),
    filmstripLeaseToken: varchar("filmstrip_lease_token", { length: 36 }),
    filmstripLeaseExpiresAt: timestamp("filmstrip_lease_expires_at", {
      withTimezone: true,
    }),
    filmstripGeneratedAt: timestamp("filmstrip_generated_at", {
      withTimezone: true,
    }),
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
    check(
      "media_proxy_status_check",
      sql`${table.proxyStatus} is null or ${table.proxyStatus} in ('queued', 'generating', 'ready', 'error')`
    ),
    check(
      "media_proxy_profile_check",
      sql`(${table.proxyStatus} is null and ${table.proxyProfile} is null) or (${table.proxyStatus} is not null and ${table.proxyProfile} = 'h264-720p')`
    ),
    check(
      "media_proxy_video_check",
      sql`${table.proxyStatus} is null or ${table.fileType} = 'video'`
    ),
    check(
      "media_proxy_ready_path_check",
      sql`${table.proxyStatus} <> 'ready' or ${table.proxyStoragePath} is not null`
    ),
    check("media_proxy_attempts_check", sql`${table.proxyAttempts} >= 0`),
    check(
      "media_filmstrip_status_check",
      sql`${table.filmstripStatus} is null or ${table.filmstripStatus} in ('queued', 'generating', 'ready', 'error')`
    ),
    check(
      "media_filmstrip_profile_check",
      sql`(${table.filmstripStatus} is null and ${table.filmstripProfile} is null) or (${table.filmstripStatus} is not null and ${table.filmstripProfile} = 'jpeg-160h-v1')`
    ),
    check(
      "media_filmstrip_video_check",
      sql`${table.filmstripStatus} is null or ${table.fileType} = 'video'`
    ),
    check(
      "media_filmstrip_ready_check",
      sql`${table.filmstripStatus} <> 'ready' or (${table.filmstripStoragePath} is not null and ${table.filmstripFrameCount} > 0 and ${table.filmstripFrameWidth} > 0 and ${table.filmstripFrameHeight} > 0 and ${table.filmstripColumns} > 0 and ${table.filmstripDurationMs} > 0)`
    ),
    check(
      "media_filmstrip_attempts_check",
      sql`${table.filmstripAttempts} >= 0`
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
    index("ix_media_proxy_status_created").on(
      table.proxyStatus,
      table.createdAt
    ),
    index("ix_media_filmstrip_status_created").on(
      table.filmstripStatus,
      table.createdAt
    ),
  ]
)

// Named manual groupings of library media. A media item can belong to any
// number of them, so membership lives in the join table below.
export const aiVideoMediaCollections = pgTable(
  "media_collections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_media_collections_user_id").on(table.userId),
    // Case-insensitive, so one library cannot hold both "Logos" and "logos".
    uniqueIndex("ux_media_collections_user_name").on(
      table.userId,
      sql`lower(${table.name})`
    ),
  ]
)

// Both foreign keys cascade: deleting a collection detaches its items without
// touching the media, and deleting media drops its memberships.
export const aiVideoMediaCollectionItems = pgTable(
  "media_collection_items",
  {
    collectionId: varchar("collection_id", { length: 36 })
      .notNull()
      .references(() => aiVideoMediaCollections.id, { onDelete: "cascade" }),
    mediaId: varchar("media_id", { length: 36 })
      .notNull()
      .references(() => aiVideoMedia.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.mediaId] }),
    index("ix_media_collection_items_media_id").on(table.mediaId),
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

export const aiVideoFirstFrames = pgTable(
  "first_frames",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    actorId: varchar("actor_id", { length: 36 })
      .notNull()
      .references(() => aiVideoActors.id, { onDelete: "cascade" }),
    generatedMediaId: varchar("generated_media_id", {
      length: 36,
    }).references(() => aiVideoMedia.id, { onDelete: "set null" }),
    referenceMediaId: varchar("reference_media_id", { length: 36 }).references(
      () => aiVideoMedia.id,
      { onDelete: "set null" }
    ),
    referenceSource: varchar("reference_source", { length: 20 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    prompt: text("prompt").notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    aspectRatio: varchar("aspect_ratio", { length: 10 }).notNull(),
    tags: jsonb("tags").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "first_frames_reference_source_check",
      sql`${table.referenceSource} in ('actor', 'media')`
    ),
    check(
      "first_frames_aspect_ratio_check",
      sql`${table.aspectRatio} in ('9:16', '16:9', '1:1')`
    ),
    index("ix_first_frames_user_id").on(table.userId),
    index("ix_first_frames_actor_id").on(table.actorId),
    index("ix_first_frames_generated_media_id").on(table.generatedMediaId),
    index("ix_first_frames_reference_media_id").on(table.referenceMediaId),
    index("ix_first_frames_user_pinned_created").on(
      table.userId,
      table.pinned,
      table.createdAt
    ),
  ]
)

export const aiVideoGenerations = pgTable(
  "ai_video_generations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => aiVideoProjects.id, { onDelete: "cascade" }),
    firstFrameId: varchar("first_frame_id", { length: 36 })
      .notNull()
      .references(() => aiVideoFirstFrames.id, { onDelete: "cascade" }),
    firstFrameMediaId: varchar("first_frame_media_id", {
      length: 36,
    }).references(() => aiVideoMedia.id, { onDelete: "set null" }),
    prompt: text("prompt").notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    aspectRatio: varchar("aspect_ratio", { length: 10 }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    resolution: varchar("resolution", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    operationName: text("operation_name"),
    requestedPlayheadMs: integer("requested_playhead_ms").notNull(),
    mediaId: varchar("media_id", { length: 36 }).references(
      () => aiVideoMedia.id,
      { onDelete: "set null" }
    ),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "ai_video_generations_status_check",
      sql`${table.status} in ('queued', 'processing', 'ready', 'error')`
    ),
    check(
      "ai_video_generations_aspect_ratio_check",
      sql`${table.aspectRatio} in ('9:16', '16:9')`
    ),
    check(
      "ai_video_generations_duration_check",
      sql`${table.durationSeconds} in (4, 6, 8)`
    ),
    index("ix_ai_video_generations_user_id").on(table.userId),
    index("ix_ai_video_generations_project_id").on(table.projectId),
    index("ix_ai_video_generations_first_frame_id").on(table.firstFrameId),
    index("ix_ai_video_generations_media_id").on(table.mediaId),
    index("ix_ai_video_generations_project_updated").on(
      table.projectId,
      table.updatedAt
    ),
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
    // Bumped by every timeline write. Savers send the version they loaded and
    // the write only lands if it still matches, so a second tab or a
    // server-side writer can't silently overwrite newer work.
    version: integer("version").notNull().default(1),
    // Latest export: rendering → ready/error; the MP4 lives at renderStoragePath.
    renderStatus: varchar("render_status", { length: 20 }),
    renderError: text("render_error"),
    renderStoragePath: varchar("render_storage_path", { length: 500 }),
    renderFileSize: bigint("render_file_size", { mode: "number" }),
    renderThumbnailStoragePath: varchar("render_thumbnail_storage_path", {
      length: 500,
    }),
    renderTitle: varchar("render_title", { length: 255 }),
    renderCaption: text("render_caption"),
    renderedAt: timestamp("rendered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "video_projects_render_status_check",
      sql`${table.renderStatus} in ('queued', 'rendering', 'ready', 'error')`
    ),
    index("ix_video_projects_user_id").on(table.userId),
    index("ix_video_projects_user_created").on(table.userId, table.createdAt),
    index("ix_video_projects_template_id").on(table.templateId),
  ]
)

export const aiVideoRenderJobs = pgTable(
  "render_jobs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => aiVideoProjects.id, { onDelete: "cascade" }),
    quality: varchar("quality", { length: 10 }).notNull(),
    includeEndCard: boolean("include_end_card").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    // Running jobs hold a lease the worker keeps extending; a lease that
    // expires marks the job as orphaned (crashed process) for reclaim.
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "render_jobs_status_check",
      sql`${table.status} in ('queued', 'running', 'ready', 'error', 'cancelled')`
    ),
    check(
      "render_jobs_quality_check",
      sql`${table.quality} in ('high', 'medium', 'low')`
    ),
    // One active job per project — duplicate enqueues become no-op conflicts.
    uniqueIndex("ux_render_jobs_project_active")
      .on(table.projectId)
      .where(sql`${table.status} in ('queued', 'running')`),
    index("ix_render_jobs_status_created").on(table.status, table.createdAt),
    index("ix_render_jobs_user_id").on(table.userId),
  ]
)

export const aiVideoCarousels = pgTable(
  "instagram_carousels",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    format: varchar("format", { length: 20 }).notNull().default("4:5"),
    sourceText: text("source_text").notNull().default(""),
    caption: text("caption").notNull().default(""),
    // Serialized carousel builder state:
    // { slides: [{ items: [{ type: "text" | "image" | "video" | "gradient-shadow", ... }] }] }
    slides: jsonb("slides").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "instagram_carousels_format_check",
      sql`${table.format} in ('4:5', '1:1', '9:16')`
    ),
    index("ix_instagram_carousels_user_id").on(table.userId),
    index("ix_instagram_carousels_user_updated").on(
      table.userId,
      table.updatedAt
    ),
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
    followerCount: bigint("follower_count", { mode: "number" }),
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
    // survives deletion of the source reel/creator. Null for blank templates.
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

// Automation canvas: user-built node graphs chaining pipeline steps. The
// graph lives verbatim on the automation row (AutomationGraph jsonb) and is
// snapshotted onto every run so later edits never corrupt run history.
export const aiVideoAutomations = pgTable(
  "automations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    // { nodes, edges, viewport } — see src/lib/automations/automation.ts.
    graph: jsonb("graph").notNull(),
    // Master switch for the schedule + creator-posted triggers. Manual runs
    // work regardless so a disabled automation can still be tested.
    enabled: boolean("enabled").notNull().default(false),
    // Denormalized from the graph's Schedule trigger on save/toggle; the
    // scheduler claims automations where enabled and next_run_at <= now().
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_automations_user_id").on(table.userId),
    index("ix_automations_next_run").on(table.nextRunAt),
  ]
)

// One execution of an automation — the durable queue unit, modeled on
// render_jobs: leases + attempts + orphan reclaim survive process restarts.
export const aiVideoAutomationRuns = pgTable(
  "automation_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    automationId: varchar("automation_id", { length: 36 })
      .notNull()
      .references(() => aiVideoAutomations.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull(),
    triggerType: varchar("trigger_type", { length: 20 }).notNull(),
    // Trigger context, e.g. { creatorId, videoIds } for creator_posted runs.
    triggerPayload: jsonb("trigger_payload"),
    // Graph snapshot at enqueue time.
    nodes: jsonb("nodes").notNull(),
    edges: jsonb("edges").notNull(),
    attempts: integer("attempts").notNull().default(0),
    // Running runs hold a lease the worker keeps extending; a lease that
    // expires marks the run as orphaned (crashed process) for reclaim.
    leaseToken: varchar("lease_token", { length: 36 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "automation_runs_status_check",
      sql`${table.status} in ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'canceled')`
    ),
    check(
      "automation_runs_trigger_type_check",
      sql`${table.triggerType} in ('manual', 'schedule', 'creator_posted')`
    ),
    // One active run per automation — duplicate enqueues become no-op
    // conflicts. A run parked at an approval checkpoint still counts as active.
    uniqueIndex("ux_automation_runs_automation_active")
      .on(table.automationId)
      .where(sql`${table.status} in ('queued', 'running', 'waiting_approval')`),
    index("ix_automation_runs_status_created").on(
      table.status,
      table.createdAt
    ),
    index("ix_automation_runs_automation_created").on(
      table.automationId,
      table.createdAt
    ),
    index("ix_automation_runs_user_id").on(table.userId),
  ]
)

// One row per graph node a run will execute; the per-node status/output the
// runs panel shows. unique(run_id, node_id) keeps step creation idempotent.
export const aiVideoAutomationRunSteps = pgTable(
  "automation_run_steps",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiVideoUsers.id, { onDelete: "cascade" }),
    runId: varchar("run_id", { length: 36 })
      .notNull()
      .references(() => aiVideoAutomationRuns.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id", { length: 64 }).notNull(),
    nodeKind: varchar("node_kind", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    // Executor result, e.g. { videoIds: [...], summary: "..." }.
    output: jsonb("output"),
    error: text("error"),
    // Approval checkpoint bookkeeping, only set on waitForApproval steps: when
    // the auto-reject fires and what the decision ended up being.
    approvalDeadlineAt: timestamp("approval_deadline_at", {
      withTimezone: true,
    }),
    approvalDecision: varchar("approval_decision", { length: 20 }),
    approvalDecidedAt: timestamp("approval_decided_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "automation_run_steps_status_check",
      sql`${table.status} in ('pending', 'running', 'waiting_approval', 'completed', 'failed', 'skipped')`
    ),
    check(
      "automation_run_steps_approval_decision_check",
      sql`${table.approvalDecision} is null or ${table.approvalDecision} in ('approved', 'rejected', 'timed_out')`
    ),
    unique("automation_run_steps_run_node_unique").on(
      table.runId,
      table.nodeId
    ),
    index("ix_automation_run_steps_run_status").on(table.runId, table.status),
    index("ix_automation_run_steps_approval_deadline")
      .on(table.approvalDeadlineAt)
      .where(sql`${table.status} = 'waiting_approval'`),
  ]
)

export type AiVideoUser = typeof aiVideoUsers.$inferSelect
export type AiVideoWorkspace = typeof aiVideoWorkspaces.$inferSelect
export type AiVideoApiUsageLimit = typeof aiVideoApiUsageLimits.$inferSelect
export type AiVideoApiUsageEvent = typeof aiVideoApiUsageEvents.$inferSelect
export type AiVideoApiUsageAlert = typeof aiVideoApiUsageAlerts.$inferSelect
export type AiVideoMedia = typeof aiVideoMedia.$inferSelect
export type AiVideoMediaCollection =
  typeof aiVideoMediaCollections.$inferSelect
export type AiVideoActor = typeof aiVideoActors.$inferSelect
export type AiVideoFirstFrame = typeof aiVideoFirstFrames.$inferSelect
export type AiVideoGeneration = typeof aiVideoGenerations.$inferSelect
export type AiVideoProject = typeof aiVideoProjects.$inferSelect
export type AiVideoRenderJob = typeof aiVideoRenderJobs.$inferSelect
export type AiVideoCarousel = typeof aiVideoCarousels.$inferSelect
export type AiVideoCreator = typeof aiVideoCreators.$inferSelect
export type AiVideoViralVideo = typeof aiVideoViralVideos.$inferSelect
export type AiVideoTemplate = typeof aiVideoTemplates.$inferSelect
export type AiVideoFeedback = typeof aiVideoFeedback.$inferSelect
export type AiVideoFeedbackComment = typeof aiVideoFeedbackComments.$inferSelect
export type AiVideoNotification = typeof aiVideoNotifications.$inferSelect
export type AiVideoAutomation = typeof aiVideoAutomations.$inferSelect
export type AiVideoAutomationRun = typeof aiVideoAutomationRuns.$inferSelect
export type AiVideoAutomationRunStep =
  typeof aiVideoAutomationRunSteps.$inferSelect
