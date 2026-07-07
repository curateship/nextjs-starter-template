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

export const projects = pgTable(
  "projects",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    workspaceId: varchar("workspace_id", { length: 36 }).references(
      () => customShellWorkspaces.id,
      { onDelete: "cascade" }
    ),
    name: text("name").notNull(),
    domain: text("domain"),
    normalizedDomain: text("normalized_domain"),
    locationCode: integer("location_code").notNull(),
    locationName: text("location_name"),
    languageCode: text("language_code").notNull(),
    languageName: text("language_name"),
    searchEngine: text("search_engine").notNull().default("google"),
    scheduleFrequency: text("schedule_frequency").notNull().default("manual"),
    scheduleLastRunAt: timestamp("schedule_last_run_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_projects_user_id").on(table.userId),
    unique("ux_projects_workspace_id").on(table.workspaceId),
  ]
)

export const keywordClusters = pgTable(
  "keyword_clusters",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    anchor: text("anchor"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ix_keyword_clusters_project_id").on(table.projectId)]
)

export const projectCompetitors = pgTable(
  "project_competitors",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    normalizedDomain: text("normalized_domain").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("project_competitors_project_id_normalized_domain_key").on(
      table.projectId,
      table.normalizedDomain
    ),
  ]
)

export const keywordJobs = pgTable(
  "keyword_jobs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull().default("pending"),
    input: jsonb("input").notNull(),
    progress: integer("progress").notNull().default(0),
    currentStep: text("current_step"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_keyword_jobs_project_status").on(table.projectId, table.status),
  ]
)

export const keywords = pgTable(
  "keywords",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    keyword: text("keyword").notNull(),
    normalizedKeyword: text("normalized_keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("keywords_normalized_keyword_location_code_language_code_key").on(
      table.normalizedKeyword,
      table.locationCode,
      table.languageCode
    ),
    index("idx_keywords_normalized").on(table.normalizedKeyword),
  ]
)

export const keywordMetrics = pgTable(
  "keyword_metrics",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    keywordId: varchar("keyword_id", { length: 36 })
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("dataforseo"),
    sourceEndpoint: text("source_endpoint").notNull(),
    searchVolume: integer("search_volume"),
    monthlySearches: jsonb("monthly_searches"),
    cpc: numeric("cpc", { precision: 12, scale: 4 }),
    competition: numeric("competition", { precision: 8, scale: 4 }),
    competitionLevel: text("competition_level"),
    lowTopOfPageBid: numeric("low_top_of_page_bid", {
      precision: 12,
      scale: 4,
    }),
    highTopOfPageBid: numeric("high_top_of_page_bid", {
      precision: 12,
      scale: 4,
    }),
    keywordDifficulty: integer("keyword_difficulty"),
    intent: text("intent"),
    intentProbability: numeric("intent_probability", {
      precision: 8,
      scale: 4,
    }),
    secondaryIntents: jsonb("secondary_intents"),
    trendScore: integer("trend_score"),
    serpFeatures: jsonb("serp_features"),
    rawResponse: jsonb("raw_response"),
    providerUpdatedAt: timestamp("provider_updated_at", {
      withTimezone: true,
    }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("keyword_metrics_keyword_id_provider_key").on(
      table.keywordId,
      table.provider
    ),
    index("idx_keyword_metrics_keyword_fetched").on(
      table.keywordId,
      table.fetchedAt
    ),
  ]
)

export const projectKeywords = pgTable(
  "project_keywords",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keywordId: varchar("keyword_id", { length: 36 })
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceDetails: jsonb("source_details"),
    status: text("status").notNull().default("new"),
    opportunityScore: integer("opportunity_score"),
    scoreExplanation: jsonb("score_explanation"),
    suggestedPageType: text("suggested_page_type"),
    assignedUrl: text("assigned_url"),
    notes: text("notes"),
    trackedAt: timestamp("tracked_at", { withTimezone: true }),
    clusterId: varchar("cluster_id", { length: 36 }).references(
      () => keywordClusters.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("project_keywords_project_id_keyword_id_key").on(
      table.projectId,
      table.keywordId
    ),
    index("idx_project_keywords_project_status").on(
      table.projectId,
      table.status
    ),
    index("idx_project_keywords_project_score").on(
      table.projectId,
      table.opportunityScore
    ),
    index("idx_project_keywords_project_cluster").on(
      table.projectId,
      table.clusterId
    ),
  ]
)

export const apiUsageLogs = pgTable(
  "api_usage_logs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: varchar("user_id", { length: 36 }).notNull(),
    projectId: varchar("project_id", { length: 36 }),
    jobId: varchar("job_id", { length: 36 }),
    provider: text("provider").notNull(),
    endpoint: text("endpoint").notNull(),
    requestPayloadHash: text("request_payload_hash"),
    requestCount: integer("request_count").notNull().default(1),
    keywordCount: integer("keyword_count"),
    cost: numeric("cost", { precision: 12, scale: 6 }),
    statusCode: integer("status_code"),
    statusMessage: text("status_message"),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_api_usage_logs_user_created").on(table.userId, table.createdAt),
    index("ix_api_usage_logs_job_id").on(table.jobId),
    index("ix_api_usage_logs_payload_hash").on(
      table.requestPayloadHash,
      table.createdAt
    ),
  ]
)

export const keywordRankings = pgTable(
  "keyword_rankings",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keywordId: varchar("keyword_id", { length: 36 })
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    position: integer("position"),
    rankingUrl: text("ranking_url"),
    rankingTitle: text("ranking_title"),
    topResults: jsonb("top_results"),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_keyword_rankings_project_keyword_checked").on(
      table.projectId,
      table.keywordId,
      table.checkedAt
    ),
  ]
)

export const keywordRankingAlerts = pgTable(
  "keyword_ranking_alerts",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keywordId: varchar("keyword_id", { length: 36 })
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    previousPosition: integer("previous_position"),
    newPosition: integer("new_position"),
    delta: integer("delta"),
    keywordSnapshot: text("keyword_snapshot").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "keyword_ranking_alerts_type_check",
      sql`${table.type} in ('new_ranking', 'lost_ranking', 'entered_top_10', 'left_top_10', 'big_gain', 'big_drop')`
    ),
    index("idx_keyword_ranking_alerts_project_created").on(
      table.projectId,
      table.createdAt
    ),
    index("idx_keyword_ranking_alerts_project_read").on(
      table.projectId,
      table.readAt
    ),
  ]
)

export const backlinkProspects = pgTable(
  "backlink_prospects",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    referringDomain: text("referring_domain").notNull(),
    normalizedDomain: text("normalized_domain").notNull(),
    domainRank: integer("domain_rank"),
    backlinksCount: integer("backlinks_count"),
    referringTo: jsonb("referring_to"),
    status: text("status").notNull().default("new"),
    contactUrl: text("contact_url"),
    contactEmail: text("contact_email"),
    notes: text("notes"),
    discoveredVia: text("discovered_via")
      .notNull()
      .default("domain_intersection"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("backlink_prospects_project_id_normalized_domain_key").on(
      table.projectId,
      table.normalizedDomain
    ),
    check(
      "backlink_prospects_status_check",
      sql`${table.status} in ('new', 'qualified', 'contacted', 'replied', 'won', 'rejected')`
    ),
    index("idx_backlink_prospects_project_status").on(
      table.projectId,
      table.status
    ),
    index("idx_backlink_prospects_project_rank").on(
      table.projectId,
      table.domainRank
    ),
  ]
)

export const backlinkSnapshots = pgTable(
  "backlink_snapshots",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    target: text("target").notNull(),
    domainRank: integer("domain_rank"),
    backlinks: integer("backlinks"),
    referringDomains: integer("referring_domains"),
    referringPages: integer("referring_pages"),
    brokenBacklinks: integer("broken_backlinks"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("backlink_snapshots_project_id_key").on(table.projectId),
  ]
)

export const dataforseoLocationsLanguages = pgTable(
  "dataforseo_locations_languages",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    locationCode: integer("location_code").notNull(),
    locationName: text("location_name").notNull(),
    countryIsoCode: text("country_iso_code"),
    languageCode: text("language_code").notNull(),
    languageName: text("language_name").notNull(),
    source: text("source").notNull().default("google"),
    keywordsCount: integer("keywords_count"),
    serpsCount: integer("serps_count"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("dataforseo_locations_languages_location_language_source_key").on(
      table.locationCode,
      table.languageCode,
      table.source
    ),
  ]
)

export type CustomShellUser = typeof customShellUsers.$inferSelect
export type CustomShellWorkspace = typeof customShellWorkspaces.$inferSelect
export type CustomShellMedia = typeof customShellMedia.$inferSelect
export type CustomShellFeedback = typeof customShellFeedback.$inferSelect
export type CustomShellFeedbackComment =
  typeof customShellFeedbackComments.$inferSelect
export type CustomShellNotification =
  typeof customShellNotifications.$inferSelect
export type Project = typeof projects.$inferSelect
export type ProjectCompetitor = typeof projectCompetitors.$inferSelect
export type KeywordJob = typeof keywordJobs.$inferSelect
export type Keyword = typeof keywords.$inferSelect
export type KeywordMetric = typeof keywordMetrics.$inferSelect
export type ProjectKeyword = typeof projectKeywords.$inferSelect
export type KeywordRanking = typeof keywordRankings.$inferSelect
export type KeywordCluster = typeof keywordClusters.$inferSelect
export type KeywordRankingAlert = typeof keywordRankingAlerts.$inferSelect
export type BacklinkProspectRecord = typeof backlinkProspects.$inferSelect
export type BacklinkSnapshot = typeof backlinkSnapshots.$inferSelect
