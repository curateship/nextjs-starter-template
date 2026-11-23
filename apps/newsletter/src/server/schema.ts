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
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

export const customShellUsers = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const customShellSessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
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

export const customShellSettings = pgTable(
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

export const customShellWorkspaces = pgTable(
  "workspaces",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
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

export const customShellFeedback = pgTable(
  "feedback",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
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

export const customShellFeedbackVotes = pgTable(
  "feedback_votes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => customShellFeedback.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
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

export const customShellFeedbackComments = pgTable(
  "feedback_comments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => customShellFeedback.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
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

export const customShellNotifications = pgTable(
  "notifications",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    recipientUserId: varchar("recipient_user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    actorUserId: varchar("actor_user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => customShellFeedback.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    feedbackVoteId: varchar("feedback_vote_id", { length: 36 }).references(
      () => customShellFeedbackVotes.id,
      { onDelete: "cascade" }
    ),
    feedbackCommentId: varchar("feedback_comment_id", {
      length: 36,
    }).references(() => customShellFeedbackComments.id, {
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

export const customShellMedia = pgTable(
  "media",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
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

export const newsletterContacts = pgTable(
  "newsletter_contacts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    firstName: varchar("first_name", { length: 255 }),
    lastName: varchar("last_name", { length: 255 }),
    source: varchar("source", { length: 255 }),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    customFields: jsonb("custom_fields")
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: varchar("status", { length: 20 }).notNull().default("subscribed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "newsletter_contacts_status_check",
      sql`${table.status} in ('subscribed', 'unsubscribed')`
    ),
    uniqueIndex("ux_newsletter_contacts_workspace_email").on(
      table.workspaceId,
      sql`lower(${table.email})`
    ),
    index("ix_newsletter_contacts_workspace_created").on(
      table.workspaceId,
      table.createdAt
    ),
  ]
)

export const newsletterConnections = pgTable(
  "newsletter_connections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    appKey: varchar("app_key", { length: 100 }).notNull(),
    secretHash: varchar("secret_hash", { length: 64 }).notNull(),
    secretPrefix: varchar("secret_prefix", { length: 12 }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_newsletter_connections_secret_hash").on(table.secretHash),
    index("ix_newsletter_connections_workspace").on(table.workspaceId),
  ]
)

export const newsletterAutomations = pgTable(
  "newsletter_automations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    graph: jsonb("graph")
      .notNull()
      .default(sql`'{}'::jsonb`),
    compiledConfig: jsonb("compiled_config"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "newsletter_automations_status_check",
      sql`${table.status} in ('draft', 'active', 'paused')`
    ),
    unique("ux_newsletter_automations_workspace_name").on(
      table.workspaceId,
      table.name
    ),
    index("ix_newsletter_automations_workspace_status").on(
      table.workspaceId,
      table.status
    ),
  ]
)

export const newsletterAutomationRuns = pgTable(
  "newsletter_automation_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    automationId: varchar("automation_id", { length: 36 })
      .notNull()
      .references(() => newsletterAutomations.id, { onDelete: "cascade" }),
    contactId: varchar("contact_id", { length: 36 })
      .notNull()
      .references(() => newsletterContacts.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    currentNodeId: varchar("current_node_id", { length: 100 }).notNull(),
    configSnapshot: jsonb("config_snapshot").notNull(),
    wakeAt: timestamp("wake_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    claimToken: varchar("claim_token", { length: 36 }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    error: text("error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "newsletter_runs_status_check",
      sql`${table.status} in ('active', 'waiting', 'completed', 'failed', 'cancelled')`
    ),
    unique("ux_newsletter_runs_automation_contact").on(
      table.automationId,
      table.contactId
    ),
    index("ix_newsletter_runs_status_wake").on(table.status, table.wakeAt),
    index("ix_newsletter_runs_workspace").on(table.workspaceId),
    index("ix_newsletter_runs_contact").on(table.contactId),
  ]
)

export const newsletterAutomationRunSteps = pgTable(
  "newsletter_automation_run_steps",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runId: varchar("run_id", { length: 36 })
      .notNull()
      .references(() => newsletterAutomationRuns.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id", { length: 100 }).notNull(),
    kind: varchar("kind", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    attempts: integer("attempts").notNull().default(1),
    output: jsonb("output"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "newsletter_run_steps_status_check",
      sql`${table.status} in ('completed', 'failed')`
    ),
    index("ix_newsletter_run_steps_run").on(table.runId, table.startedAt),
  ]
)

export const newsletterBroadcasts = pgTable(
  "newsletter_broadcasts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    subject: text("subject").notNull().default(""),
    preheader: text("preheader").notNull().default(""),
    fromName: varchar("from_name", { length: 255 }),
    blocks: jsonb("blocks")
      .notNull()
      .default(sql`'[]'::jsonb`),
    renderedHtml: text("rendered_html"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    audienceFilter: jsonb("audience_filter")
      .notNull()
      .default(sql`'{}'::jsonb`),
    dripConfig: jsonb("drip_config")
      .notNull()
      .default(sql`'{}'::jsonb`),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    nextBatchAt: timestamp("next_batch_at", { withTimezone: true }),
    batchesSent: integer("batches_sent").notNull().default(0),
    pausedReason: text("paused_reason"),
    totalRecipients: integer("total_recipients").notNull().default(0),
    totalSent: integer("total_sent").notNull().default(0),
    totalFailed: integer("total_failed").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    claimToken: varchar("claim_token", { length: 36 }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "newsletter_broadcasts_status_check",
      sql`${table.status} in ('draft', 'scheduled', 'sending', 'paused', 'sent')`
    ),
    index("ix_newsletter_broadcasts_workspace_status").on(
      table.workspaceId,
      table.status
    ),
    index("ix_newsletter_broadcasts_status_next_batch").on(
      table.status,
      table.nextBatchAt
    ),
  ]
)

export const newsletterBroadcastTemplates = pgTable(
  "newsletter_broadcast_templates",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    blocks: jsonb("blocks")
      .notNull()
      .default(sql`'[]'::jsonb`),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_newsletter_broadcast_templates_workspace").on(table.workspaceId),
    uniqueIndex("ux_newsletter_broadcast_templates_default")
      .on(table.workspaceId)
      .where(sql`${table.isDefault}`),
  ]
)

export const newsletterDeliveries = pgTable(
  "newsletter_deliveries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    runId: varchar("run_id", { length: 36 }).references(
      () => newsletterAutomationRuns.id,
      { onDelete: "set null" }
    ),
    broadcastId: varchar("broadcast_id", { length: 36 }).references(
      () => newsletterBroadcasts.id,
      { onDelete: "set null" }
    ),
    contactId: varchar("contact_id", { length: 36 })
      .notNull()
      .references(() => newsletterContacts.id, { onDelete: "cascade" }),
    toEmail: varchar("to_email", { length: 255 }).notNull(),
    subject: text("subject").notNull(),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "newsletter_deliveries_status_check",
      sql`${table.status} in ('sent', 'failed')`
    ),
    index("ix_newsletter_deliveries_workspace_created").on(
      table.workspaceId,
      table.createdAt
    ),
    index("ix_newsletter_deliveries_contact").on(table.contactId),
    index("ix_newsletter_deliveries_broadcast").on(table.broadcastId),
    uniqueIndex("ux_newsletter_deliveries_broadcast_contact")
      .on(table.broadcastId, table.contactId)
      .where(sql`${table.broadcastId} is not null`),
  ]
)

export const newsletterEmailSettings = pgTable("newsletter_email_settings", {
  workspaceId: varchar("workspace_id", { length: 36 })
    .primaryKey()
    .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
  resendApiKeyEncrypted: text("resend_api_key_encrypted"),
  fromEmail: varchar("from_email", { length: 255 }),
  fromName: varchar("from_name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export type CustomShellUser = typeof customShellUsers.$inferSelect
export type CustomShellWorkspace = typeof customShellWorkspaces.$inferSelect
export type CustomShellMedia = typeof customShellMedia.$inferSelect
export type CustomShellFeedback = typeof customShellFeedback.$inferSelect
export type CustomShellFeedbackComment =
  typeof customShellFeedbackComments.$inferSelect
export type CustomShellNotification =
  typeof customShellNotifications.$inferSelect
export type NewsletterContact = typeof newsletterContacts.$inferSelect
export type NewsletterConnection = typeof newsletterConnections.$inferSelect
export type NewsletterAutomation = typeof newsletterAutomations.$inferSelect
export type NewsletterAutomationRun =
  typeof newsletterAutomationRuns.$inferSelect
export type NewsletterAutomationRunStep =
  typeof newsletterAutomationRunSteps.$inferSelect
export type NewsletterDelivery = typeof newsletterDeliveries.$inferSelect
export type NewsletterBroadcast = typeof newsletterBroadcasts.$inferSelect
export type NewsletterBroadcastTemplate =
  typeof newsletterBroadcastTemplates.$inferSelect
export type NewsletterEmailSettings =
  typeof newsletterEmailSettings.$inferSelect
