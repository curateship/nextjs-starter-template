import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const sessions = pgTable(
  "user_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_user_sessions_user_id").on(table.userId),
    index("ix_user_sessions_token_hash").on(table.tokenHash),
    index("ix_user_sessions_expires_at").on(table.expiresAt),
  ]
)

export const settings = pgTable(
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

export const workspaces = pgTable(
  "workspaces",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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

export const feedback = pgTable(
  "feedback",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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

export const feedbackVotes = pgTable(
  "feedback_votes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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

export const feedbackComments = pgTable(
  "feedback_comments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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

export const notifications = pgTable(
  "notifications",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    recipientUserId: varchar("recipient_user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorUserId: varchar("actor_user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => feedback.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    feedbackVoteId: varchar("feedback_vote_id", { length: 36 }).references(
      () => feedbackVotes.id,
      { onDelete: "cascade" }
    ),
    feedbackCommentId: varchar("feedback_comment_id", {
      length: 36,
    }).references(() => feedbackComments.id, {
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

export const media = pgTable(
  "media",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 255 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    altText: text("alt_text"),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    fileType: varchar("file_type", { length: 20 }).notNull(),
    storagePath: text("storage_path").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "media_file_type_check",
      sql`${table.fileType} in ('image', 'video')`
    ),
    index("ix_media_user_id").on(table.userId),
    index("ix_media_file_type").on(table.fileType),
    index("ix_media_created_at").on(table.createdAt),
    index("ix_media_user_type_created").on(
      table.userId,
      table.fileType,
      table.createdAt
    ),
  ]
)

export const proxies = pgTable(
  "proxies",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    protocol: varchar("protocol", { length: 10 }).notNull(),
    host: varchar("host", { length: 255 }).notNull(),
    port: integer("port").notNull(),
    username: text("username").notNull().default(""),
    passwordEncrypted: text("password_encrypted"),
    connectionType: varchar("connection_type", { length: 20 }),
    country: varchar("country", { length: 100 }),
    enabled: boolean("enabled").notNull().default(true),
    lastStatus: varchar("last_status", { length: 20 }).notNull().default("untested"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastResponseMs: integer("last_response_ms"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("proxies_unique_endpoint").on(
      table.host,
      table.port,
      table.username
    ),
    check(
      "proxies_protocol_check",
      sql`${table.protocol} in ('http', 'https')`
    ),
    check(
      "proxies_port_check",
      sql`${table.port} between 1 and 65535`
    ),
    check(
      "proxies_connection_type_check",
      sql`${table.connectionType} is null or ${table.connectionType} in ('residential', 'mobile', 'datacenter')`
    ),
    check(
      "proxies_last_status_check",
      sql`${table.lastStatus} in ('untested', 'online', 'offline')`
    ),
    index("ix_proxies_enabled").on(table.enabled),
    index("ix_proxies_last_status").on(table.lastStatus),
    index("ix_proxies_country").on(table.country),
    index("ix_proxies_connection_type").on(table.connectionType),
  ]
)

export const providerSettings = pgTable(
  "provider_settings",
  {
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    providerKey: varchar("provider_key", { length: 50 }).notNull(),
    config: jsonb("config").notNull(),
    secretEncrypted: text("secret_encrypted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.providerKey],
      name: "provider_settings_pkey",
    }),
    check("provider_settings_provider_check", sql`${table.providerKey} in ('apify')`),
  ]
)

export const providerRunConfigs = pgTable(
  "provider_run_configs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    providerKey: varchar("provider_key", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    input: jsonb("input").notNull(),
    metadata: jsonb("metadata").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("provider_run_configs_key_check", sql`${table.providerKey} in ('google-maps')`),
    check("provider_run_configs_status_check", sql`${table.status} in ('draft', 'active', 'inactive')`),
    index("ix_provider_run_configs_workspace_provider_status").on(
      table.workspaceId,
      table.providerKey,
      table.status
    ),
  ]
)

export const providerExecutions = pgTable(
  "provider_executions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runConfigId: varchar("run_config_id", { length: 36 }).notNull().references(() => providerRunConfigs.id, { onDelete: "cascade" }),
    providerKey: varchar("provider_key", { length: 50 }).notNull(),
    providerRunId: varchar("provider_run_id", { length: 255 }),
    providerDatasetId: varchar("provider_dataset_id", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull(),
    message: text("message"),
    error: text("error"),
    stats: jsonb("stats").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("provider_executions_provider_check", sql`${table.providerKey} in ('apify')`),
    check("provider_executions_status_check", sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'aborted')`),
    index("ix_provider_executions_run_config_created").on(table.runConfigId, table.createdAt),
  ]
)

export const providerResults = pgTable(
  "provider_results",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runConfigId: varchar("run_config_id", { length: 36 }).notNull().references(() => providerRunConfigs.id, { onDelete: "cascade" }),
    executionId: varchar("execution_id", { length: 36 }).notNull().references(() => providerExecutions.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    title: text("title").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_provider_results_execution_id").on(table.executionId),
    index("ix_provider_results_run_config_id").on(table.runConfigId),
  ]
)

export const publicDirectories = pgTable(
  "public_directories",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceResultId: varchar("source_result_id", { length: 36 }).references(
      () => providerResults.id,
      { onDelete: "set null" }
    ),
    slug: varchar("slug", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    title: varchar("title", { length: 255 }).notNull(),
    metaDescription: text("meta_description"),
    featuredImage: text("featured_image"),
    publicData: jsonb("public_data").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("public_directories_workspace_slug_unique").on(
      table.workspaceId,
      table.slug
    ),
    check(
      "public_directories_status_check",
      sql`${table.status} in ('draft', 'published')`
    ),
    index("ix_public_directories_workspace_status_slug").on(
      table.workspaceId,
      table.status,
      table.slug
    ),
    index("ix_public_directories_workspace_updated").on(
      table.workspaceId,
      table.updatedAt
    ),
    unique("public_directories_source_result_id_unique").on(table.sourceResultId),
  ]
)

export type CoreUser = typeof users.$inferSelect
export type CoreWorkspace = typeof workspaces.$inferSelect
export type CoreMedia = typeof media.$inferSelect
export type CoreProxy = typeof proxies.$inferSelect
export type CoreProviderSettings = typeof providerSettings.$inferSelect
export type CoreProviderRunConfig = typeof providerRunConfigs.$inferSelect
export type CoreProviderExecution = typeof providerExecutions.$inferSelect
export type CoreProviderResult = typeof providerResults.$inferSelect
export type CorePublicDirectory = typeof publicDirectories.$inferSelect
export type CoreFeedback = typeof feedback.$inferSelect
export type CoreFeedbackComment =
  typeof feedbackComments.$inferSelect
export type CoreNotification =
  typeof notifications.$inferSelect
