import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core"

export const aiAgentsUsers = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const aiAgentsSessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsUsers.id, { onDelete: "cascade" }),
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

export const aiAgentsSettings = pgTable(
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

export const aiAgentsWorkspaces = pgTable(
  "workspaces",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsUsers.id, { onDelete: "cascade" }),
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

export const aiAgentsFeedback = pgTable(
  "feedback",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsUsers.id, { onDelete: "cascade" }),
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

export const aiAgentsFeedbackVotes = pgTable(
  "feedback_votes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsFeedback.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsUsers.id, { onDelete: "cascade" }),
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

export const aiAgentsFeedbackComments = pgTable(
  "feedback_comments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsFeedback.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsUsers.id, { onDelete: "cascade" }),
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

export const aiAgentsNotifications = pgTable(
  "notifications",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    recipientUserId: varchar("recipient_user_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsUsers.id, { onDelete: "cascade" }),
    actorUserId: varchar("actor_user_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsUsers.id, { onDelete: "cascade" }),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsFeedback.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    feedbackVoteId: varchar("feedback_vote_id", { length: 36 }).references(
      () => aiAgentsFeedbackVotes.id,
      { onDelete: "cascade" }
    ),
    feedbackCommentId: varchar("feedback_comment_id", {
      length: 36,
    }).references(() => aiAgentsFeedbackComments.id, {
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

export const aiAgentsMedia = pgTable(
  "media",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsUsers.id, { onDelete: "cascade" }),
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

// --- Voice agent domain tables ---
// Every domain table is scoped by workspace_id so the app can become
// multi-tenant later without schema changes.

export const aiAgentsContacts = pgTable(
  "contacts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsWorkspaces.id, { onDelete: "cascade" }),
    firstName: varchar("first_name", { length: 255 }).notNull(),
    lastName: varchar("last_name", { length: 255 }),
    // E.164 format, normalized before insert
    phone: varchar("phone", { length: 32 }).notNull(),
    email: varchar("email", { length: 255 }),
    // Arbitrary key/value fields; keys feed {{variable}} templating in agent prompts
    customFields: jsonb("custom_fields").notNull().default(sql`'{}'::jsonb`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    doNotCall: boolean("do_not_call").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    // Phone is the contact identity within a workspace (CSV re-import upserts on it)
    unique("contacts_workspace_phone_unique").on(table.workspaceId, table.phone),
    index("ix_contacts_workspace_created").on(table.workspaceId, table.createdAt),
  ]
)

export const aiAgentsContactNotes = pgTable(
  "contact_notes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsWorkspaces.id, { onDelete: "cascade" }),
    contactId: varchar("contact_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsContacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_contact_notes_contact_created").on(table.contactId, table.createdAt),
  ]
)

export const aiAgentsContactLists = pgTable(
  "contact_lists",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsWorkspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ix_contact_lists_workspace").on(table.workspaceId)]
)

export const aiAgentsContactListMembers = pgTable(
  "contact_list_members",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsWorkspaces.id, { onDelete: "cascade" }),
    listId: varchar("list_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsContactLists.id, { onDelete: "cascade" }),
    contactId: varchar("contact_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsContacts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("contact_list_members_unique").on(table.listId, table.contactId),
    index("ix_contact_list_members_contact").on(table.contactId),
  ]
)

export const aiAgentsAgents = pgTable(
  "agents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsWorkspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    systemPrompt: text("system_prompt").notNull().default(""),
    firstMessage: text("first_message").notNull().default(""),
    modelProvider: varchar("model_provider", { length: 50 }).notNull().default("openai"),
    model: varchar("model", { length: 100 }).notNull().default("gpt-4o"),
    voiceProvider: varchar("voice_provider", { length: 50 }).notNull().default("11labs"),
    voiceId: varchar("voice_id", { length: 255 }).notNull().default(""),
    transcriberProvider: varchar("transcriber_provider", { length: 50 })
      .notNull()
      .default("deepgram"),
    transcriberLanguage: varchar("transcriber_language", { length: 10 })
      .notNull()
      .default("en"),
    provider: varchar("provider", { length: 20 }).notNull().default("vapi"),
    // Null until first successful push to the voice provider
    providerAssistantId: varchar("provider_assistant_id", { length: 64 }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("ix_agents_workspace").on(table.workspaceId)]
)

export const aiAgentsPhoneNumbers = pgTable(
  "phone_numbers",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsWorkspaces.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).notNull().default("vapi"),
    providerPhoneNumberId: varchar("provider_phone_number_id", { length: 64 }).notNull(),
    number: varchar("number", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("phone_numbers_workspace_provider_unique").on(
      table.workspaceId,
      table.providerPhoneNumberId
    ),
  ]
)

export const aiAgentsCampaigns = pgTable(
  "campaigns",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsWorkspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    // Restrict (not cascade): a campaign keeps its references; delete campaign first
    agentId: varchar("agent_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsAgents.id, { onDelete: "restrict" }),
    phoneNumberId: varchar("phone_number_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsPhoneNumbers.id, { onDelete: "restrict" }),
    contactListId: varchar("contact_list_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsContactLists.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "campaigns_status_check",
      sql`${table.status} in ('draft', 'running', 'paused', 'completed')`
    ),
    index("ix_campaigns_workspace").on(table.workspaceId),
  ]
)

export const aiAgentsCalls = pgTable(
  "calls",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsWorkspaces.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).notNull().default("vapi"),
    // Null until the provider accepts the call; unique allows multiple nulls in PG
    providerCallId: varchar("provider_call_id", { length: 64 }).unique(),
    direction: varchar("direction", { length: 10 }).notNull().default("outbound"),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    endedReason: varchar("ended_reason", { length: 100 }),
    contactId: varchar("contact_id", { length: 36 }).references(
      () => aiAgentsContacts.id,
      { onDelete: "set null" }
    ),
    campaignId: varchar("campaign_id", { length: 36 }).references(
      () => aiAgentsCampaigns.id,
      { onDelete: "set null" }
    ),
    agentId: varchar("agent_id", { length: 36 }).references(
      () => aiAgentsAgents.id,
      { onDelete: "set null" }
    ),
    phoneNumberId: varchar("phone_number_id", { length: 36 }).references(
      () => aiAgentsPhoneNumbers.id,
      { onDelete: "set null" }
    ),
    // Denormalized so call history survives contact deletion
    customerNumber: varchar("customer_number", { length: 32 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    recordingUrl: text("recording_url"),
    transcript: text("transcript"),
    summary: text("summary"),
    cost: numeric("cost", { precision: 10, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "calls_direction_check",
      sql`${table.direction} in ('outbound', 'inbound')`
    ),
    check(
      "calls_status_check",
      sql`${table.status} in ('queued', 'ringing', 'in_progress', 'ended', 'failed')`
    ),
    index("ix_calls_workspace_created").on(table.workspaceId, table.createdAt),
    index("ix_calls_campaign").on(table.campaignId),
    index("ix_calls_contact").on(table.contactId),
  ]
)

export const aiAgentsCampaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsWorkspaces.id, { onDelete: "cascade" }),
    campaignId: varchar("campaign_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsCampaigns.id, { onDelete: "cascade" }),
    contactId: varchar("contact_id", { length: 36 })
      .notNull()
      .references(() => aiAgentsContacts.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    callId: varchar("call_id", { length: 36 }).references(() => aiAgentsCalls.id, {
      onDelete: "set null",
    }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "campaign_recipients_status_check",
      sql`${table.status} in ('pending', 'calling', 'completed', 'failed', 'skipped')`
    ),
    unique("campaign_recipients_unique").on(table.campaignId, table.contactId),
    index("ix_campaign_recipients_campaign_status").on(
      table.campaignId,
      table.status
    ),
  ]
)

export type AiAgentsUser = typeof aiAgentsUsers.$inferSelect
export type AiAgentsWorkspace = typeof aiAgentsWorkspaces.$inferSelect
export type AiAgentsMedia = typeof aiAgentsMedia.$inferSelect
export type AiAgentsFeedback = typeof aiAgentsFeedback.$inferSelect
export type AiAgentsFeedbackComment =
  typeof aiAgentsFeedbackComments.$inferSelect
export type AiAgentsNotification =
  typeof aiAgentsNotifications.$inferSelect
export type AiAgentsContact = typeof aiAgentsContacts.$inferSelect
export type AiAgentsContactNote = typeof aiAgentsContactNotes.$inferSelect
export type AiAgentsContactList = typeof aiAgentsContactLists.$inferSelect
export type AiAgentsAgent = typeof aiAgentsAgents.$inferSelect
export type AiAgentsPhoneNumber = typeof aiAgentsPhoneNumbers.$inferSelect
export type AiAgentsCampaign = typeof aiAgentsCampaigns.$inferSelect
export type AiAgentsCampaignRecipient =
  typeof aiAgentsCampaignRecipients.$inferSelect
export type AiAgentsCall = typeof aiAgentsCalls.$inferSelect
