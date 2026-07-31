import { sql } from "drizzle-orm"

import type { AutomationCompiledConfig } from "@/lib/automations/compile"
import type { AutomationGraph } from "@/lib/automations/graph"
import type { PlanFeatures } from "@/lib/plan-features"
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

export const customShellUsers = pgTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("users_role_check", sql`${table.role} in ('admin', 'member')`),
    check(
      "users_status_check",
      sql`${table.status} in ('active', 'suspended')`
    ),
  ]
)

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
    /**
     * Set while an admin is looking at the app as this member. `userId` above
     * stays the admin who signed in, so the real owner is never lost and
     * exiting is one column write. See `@/server/view-as`.
     */
    viewingAsUserId: varchar("viewing_as_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
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
    /** Null on a changelog notice: an update is posted by the product, not a person. */
    actorUserId: varchar("actor_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "cascade" }
    ),
    /** Null on a changelog notice, which is not about a piece of feedback. */
    feedbackId: varchar("feedback_id", { length: 36 }).references(
      () => customShellFeedback.id,
      { onDelete: "cascade" }
    ),
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
    /** Set on a changelog notice; deleting the update clears the notices too. */
    changelogEntryId: varchar("changelog_entry_id", { length: 36 }).references(
      () => customShellChangelogEntries.id,
      { onDelete: "cascade" }
    ),
    /** Set on an announcement notice; retiring or deleting it clears them too. */
    announcementId: varchar("announcement_id", { length: 36 }).references(
      () => customShellAnnouncements.id,
      { onDelete: "cascade" }
    ),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "notifications_type_check",
      sql`${table.type} in ('feedback_vote', 'feedback_comment', 'changelog', 'announcement')`
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
    index("ix_notifications_changelog_entry_id").on(table.changelogEntryId),
    // One notice per person per announcement, so a second tab loading at the
    // same moment cannot write a duplicate. Partial: every other kind of notice
    // leaves this column null and there can be many of those.
    uniqueIndex("ux_notifications_announcement_recipient")
      .on(table.announcementId, table.recipientUserId)
      .where(sql`${table.announcementId} is not null`),
  ]
)

export const customShellAnnouncements = pgTable(
  "announcements",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    /** How loud the banner looks: info, warning or critical. */
    level: varchar("level", { length: 20 }).notNull().default("info"),
    showBanner: boolean("show_banner").notNull().default(true),
    notify: boolean("notify").notNull().default(false),
    /**
     * The window it shows in. Always set — an announcement posted now starts
     * now. A null `endsAt` runs until somebody retires it, and retiring is
     * exactly "set `endsAt` to this moment", so there is one way to be hidden.
     */
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "announcements_level_check",
      sql`${table.level} in ('info', 'warning', 'critical')`
    ),
    // `>=` rather than `>` on purpose: retiring something that had not started
    // yet closes its window down to nothing, which is how it never shows.
    check(
      "announcements_window_check",
      sql`${table.endsAt} is null or ${table.endsAt} >= ${table.startsAt}`
    ),
    check(
      "announcements_channel_check",
      sql`${table.showBanner} or ${table.notify}`
    ),
    index("ix_announcements_window").on(table.startsAt, table.endsAt),
  ]
)

/** Dismissing hides the banner for one person only, so the row is the pair. */
export const customShellAnnouncementDismissals = pgTable(
  "announcement_dismissals",
  {
    announcementId: varchar("announcement_id", { length: 36 })
      .notNull()
      .references(() => customShellAnnouncements.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.announcementId, table.userId] }),
    index("ix_announcement_dismissals_user_id").on(table.userId),
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

export const customShellAuthTokens = pgTable(
  "auth_tokens",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    purpose: varchar("purpose", { length: 20 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "auth_tokens_purpose_check",
      sql`${table.purpose} in ('verify_email', 'reset_password')`
    ),
    index("ix_auth_tokens_user_purpose").on(table.userId, table.purpose),
    index("ix_auth_tokens_expires_at").on(table.expiresAt),
  ]
)

export const customShellRateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 200 }).primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", {
    withTimezone: true,
  }).notNull(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const customShellPlans = pgTable(
  "plans",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    slug: varchar("slug", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description").notNull().default(""),
    priceMonthlyCents: integer("price_monthly_cents").notNull().default(0),
    priceYearlyCents: integer("price_yearly_cents").notNull().default(0),
    currency: varchar("currency", { length: 10 }).notNull().default("usd"),
    stripePriceIdMonthly: varchar("stripe_price_id_monthly", { length: 120 }),
    stripePriceIdYearly: varchar("stripe_price_id_yearly", { length: 120 }),
    trialDays: integer("trial_days").notNull().default(0),
    /** Free-form per-product limits and flags, read through entitlements. */
    features: jsonb("features")
      .$type<PlanFeatures>()
      .notNull()
      .default({}),
    /** The plan everyone without a paid subscription falls back to. */
    isDefault: boolean("is_default").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "plans_prices_check",
      sql`${table.priceMonthlyCents} >= 0 and ${table.priceYearlyCents} >= 0`
    ),
    check("plans_trial_days_check", sql`${table.trialDays} >= 0`),
    index("ix_plans_sort_order").on(table.sortOrder),
  ]
)

export const customShellSubscriptions = pgTable(
  "subscriptions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .unique()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    planId: varchar("plan_id", { length: 36 }).references(
      () => customShellPlans.id,
      { onDelete: "set null" }
    ),
    stripeCustomerId: varchar("stripe_customer_id", { length: 120 }).unique(),
    stripeSubscriptionId: varchar("stripe_subscription_id", {
      length: 120,
    }).unique(),
    status: varchar("status", { length: 30 }).notNull(),
    interval: varchar("interval", { length: 10 }).notNull().default("monthly"),
    /** `manual` rows are comp plans granted by an admin, not billed by Stripe. */
    source: varchar("source", { length: 10 }).notNull().default("stripe"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "subscriptions_interval_check",
      sql`${table.interval} in ('monthly', 'yearly')`
    ),
    check(
      "subscriptions_source_check",
      sql`${table.source} in ('stripe', 'manual')`
    ),
    index("ix_subscriptions_plan_id").on(table.planId),
    index("ix_subscriptions_status").on(table.status),
  ]
)

export const customShellBillingEvents = pgTable("billing_events", {
  eventId: varchar("event_id", { length: 120 }).primaryKey(),
  type: varchar("type", { length: 120 }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull(),
})

export const customShellAutomations = pgTable(
  "automations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    /** The editor's draft: nodes, edges, viewport — saved as the user drew it. */
    graph: jsonb("graph").$type<AutomationGraph>().notNull(),
    /**
     * The compile-on-save result, null whenever the draft has validation
     * errors. Only a fresh server-side compile may write this column; the run
     * engine (a later task) reads exclusively from it, never from `graph`.
     */
    compiledConfig: jsonb("compiled_config").$type<AutomationCompiledConfig>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("automations_user_name_unique").on(table.userId, table.name),
    index("ix_automations_user_updated").on(table.userId, table.updatedAt),
  ]
)

export const customShellChangelogEntries = pgTable(
  "changelog_entries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    /** Null while the entry is a draft. Only published entries reach members. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_changelog_entries_published_at").on(table.publishedAt),
  ]
)

export type CustomShellUser = typeof customShellUsers.$inferSelect
export type CustomShellChangelogEntry =
  typeof customShellChangelogEntries.$inferSelect
export type CustomShellPlan = typeof customShellPlans.$inferSelect
export type CustomShellSubscription =
  typeof customShellSubscriptions.$inferSelect
export type CustomShellWorkspace = typeof customShellWorkspaces.$inferSelect
export type CustomShellMedia = typeof customShellMedia.$inferSelect
export type CustomShellFeedback = typeof customShellFeedback.$inferSelect
export type CustomShellFeedbackComment =
  typeof customShellFeedbackComments.$inferSelect
export type CustomShellNotification =
  typeof customShellNotifications.$inferSelect
export type CustomShellAutomation = typeof customShellAutomations.$inferSelect
export type CustomShellAnnouncement =
  typeof customShellAnnouncements.$inferSelect
