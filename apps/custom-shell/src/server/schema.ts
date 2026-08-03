import { sql } from "drizzle-orm"

import type { AutomationCompiledConfig } from "@/lib/automations/compile"
import type { AutomationGraph } from "@/lib/automations/graph"
import type { PlanFeatures } from "@/lib/plan-features"
import {
  bigint,
  boolean,
  check,
  date,
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
    /**
     * Null for an account that has no password — one created by signing in
     * with Google. Every password check treats null as "no password will ever
     * match", and Account → Security offers to set one.
     */
    passwordHash: text("password_hash"),
    /**
     * The public URL of this account's profile photo, and null when it has
     * none. Always a picture the account itself uploaded — the server checks
     * that before writing it — so it can be rendered straight into the shell.
     */
    avatarUrl: text("avatar_url"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /**
     * When this account was marked for deletion, and null whenever it was not.
     * Set only alongside the `pending_deletion` status — the check below holds
     * the pair together both ways.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /**
     * Who marked it. An account its own owner marked can be brought back by
     * signing in; one an admin marked cannot, or a member could quietly undo a
     * moderation decision.
     */
    deletedBy: varchar("deleted_by", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("users_role_check", sql`${table.role} in ('admin', 'member')`),
    check(
      "users_status_check",
      sql`${table.status} in ('active', 'suspended', 'pending_deletion')`
    ),
    check(
      "users_deleted_at_check",
      sql`(${table.status} = 'pending_deletion') = (${table.deletedAt} is not null)`
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
     * When this session last made a request, refreshed at most once a minute.
     * The idle limit in the session policy is judged against it.
     */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * The browser this session was started from, exactly as it introduced
     * itself. Stored raw so the device list can be described better later
     * without having re-asked anybody to sign in. Null for sessions that
     * predate the device list, and for a browser that sends no user agent.
     */
    userAgent: text("user_agent"),
    /**
     * Where the sign-in came from, kept whole rather than masked: it is only
     * ever shown to the person who signed in from it, and it dies with this
     * row. Null when the address could not be read.
     */
    ipAddress: varchar("ip_address", { length: 45 }),
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

/** The one row the settings table may hold — enforced by the check below. */
export const DEFAULT_SETTINGS_KEY = "default"

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
    /** Where the item sits on the roadmap; every new item starts open. */
    status: varchar("status", { length: 20 }).notNull().default("open"),
    message: text("message").notNull(),
    // What the item is about, from the fixed list in `lib/feedback-tags.ts`.
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /**
     * One optional screenshot, kept as a media row under the author's account.
     * Deleting that media row only clears this — the feedback survives its
     * picture — while deleting the feedback takes the file with it.
     */
    attachmentMediaId: varchar("attachment_media_id", { length: 36 }).references(
      () => customShellMedia.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "feedback_type_check",
      sql`${table.type} in ('suggestion', 'bug_report', 'question', 'praise')`
    ),
    check(
      "feedback_status_check",
      sql`${table.status} in ('open', 'planned', 'in_progress', 'done')`
    ),
    check(
      "feedback_tags_check",
      sql`${table.tags} <@ ARRAY['dashboard','media','automations','account','billing','performance','design']::text[] AND cardinality(${table.tags}) <= 3`
    ),
    index("ix_feedback_user_id").on(table.userId),
    index("ix_feedback_type").on(table.type),
    index("ix_feedback_attachment_media_id").on(table.attachmentMediaId),
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
      sql`${table.type} in ('feedback_vote', 'feedback_comment', 'feedback_merged', 'changelog', 'announcement', 'ai_limit_warning', 'ai_limit_reached')`
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
    /**
     * Only on a `change_email` link: the address opening it would move the
     * account to. Held here rather than on `users` so nothing about the account
     * changes until the link is actually opened.
     */
    newEmail: varchar("new_email", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "auth_tokens_purpose_check",
      sql`${table.purpose} in ('verify_email', 'reset_password', 'login', 'change_email')`
    ),
    check(
      "auth_tokens_new_email_check",
      sql`(${table.purpose} = 'change_email') = (${table.newEmail} is not null)`
    ),
    index("ix_auth_tokens_user_purpose").on(table.userId, table.purpose),
    index("ix_auth_tokens_expires_at").on(table.expiresAt),
  ]
)

/**
 * One sign-in provider account linked to one account here.
 *
 * Keyed on the provider's own permanent id for the person rather than their
 * email, so changing the address on the Google account still comes back here.
 */
export const customShellOauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).notNull(),
    /** Google's `sub` — the permanent id for that Google account. */
    providerAccountId: varchar("provider_account_id", {
      length: 255,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("oauth_accounts_provider_check", sql`${table.provider} in ('google')`),
    unique("oauth_accounts_provider_account_unique").on(
      table.provider,
      table.providerAccountId
    ),
    index("ix_oauth_accounts_user_id").on(table.userId),
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

/**
 * One member's billing history: trial started, subscribed, plan switched,
 * payment failed, cancelled.
 *
 * Insert-only. `subscriptions` above is overwritten on every change and so only
 * ever says what is true now; this is the diary beside it. A row is written
 * only when something actually changed, so the list reads as events rather than
 * as webhook traffic.
 */
export const customShellSubscriptionEvents = pgTable(
  "subscription_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** Our vocabulary, worded by `lib/subscription-events.ts`. */
    kind: varchar("kind", { length: 40 }).notNull(),
    /** The plan's name at the time, copied so a rename cannot rewrite history. */
    planName: varchar("plan_name", { length: 120 }),
    /** The one extra fact the sentence needs — meaning depends on the kind. */
    detail: varchar("detail", { length: 200 }),
    source: varchar("source", { length: 10 }).notNull(),
    /** Unique, so one webhook can only ever write one row here. */
    stripeEventId: varchar("stripe_event_id", { length: 120 }).unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_subscription_events_user_id").on(
      table.userId,
      table.createdAt.desc()
    ),
  ]
)

/**
 * Chargebacks — a member telling their bank to take a payment back.
 *
 * Written only by the Stripe webhook, read only by the admin billing page.
 * Unlike invoices, which are read live from Stripe, these are mirrored here
 * because the whole point is knowing one is open without going to look.
 */
export const customShellDisputes = pgTable(
  "disputes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    stripeDisputeId: varchar("stripe_dispute_id", { length: 120 })
      .notNull()
      .unique(),
    stripeChargeId: varchar("stripe_charge_id", { length: 120 }),
    /** Null when the charge cannot be traced to an account here. */
    userId: varchar("user_id", { length: 36 }).references(
      () => customShellUsers.id,
      // Never cascade: a chargeback outlives the account it came from.
      { onDelete: "set null" }
    ),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    reason: varchar("reason", { length: 60 }).notNull(),
    /** Stripe's word, unconstrained on purpose — see the migration. */
    status: varchar("status", { length: 30 }).notNull(),
    evidenceDueBy: timestamp("evidence_due_by", { withTimezone: true }),
    /** Which Stripe dashboard the deep link should open. */
    livemode: boolean("livemode").notNull().default(true),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_disputes_status").on(table.status),
    index("ix_disputes_opened_at").on(table.openedAt),
    index("ix_disputes_user_id").on(table.userId),
  ]
)

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

/**
 * One API key per AI provider ("anthropic" | "openai"), app-wide. `apiKey` is
 * never the key as typed: it is the AES-256-GCM output of
 * `encryptSecret` (`src/server/encryption.ts`), stored as
 * base64(iv).base64(tag).base64(ciphertext), so a stolen database backup does
 * not contain a usable key.
 */
export const customShellAiProviderKeys = pgTable("ai_provider_keys", {
  provider: varchar("provider", { length: 20 }).primaryKey(),
  apiKey: text("api_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

/**
 * One registered passkey (WebAuthn credential). `publicKey` is exactly that —
 * public — so unlike a password hash there is nothing on this row a database
 * thief could sign in with.
 */
export const customShellPasskeys = pgTable(
  "passkeys",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** The authenticator's own id for the credential, base64url, world-unique. */
    credentialId: text("credential_id").notNull().unique(),
    /** The COSE public key, base64url. */
    publicKey: text("public_key").notNull(),
    /**
     * The authenticator's use count. A signature arriving with a count no
     * higher than this one is a replay or a cloned credential, and is refused.
     * Many platform authenticators always report 0, which the check allows.
     */
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    /** How the browser reached the authenticator (JSON array), or null. */
    transports: text("transports"),
    name: varchar("name", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [index("ix_passkeys_user_id").on(table.userId)]
)

/**
 * A passkey ceremony in flight: the random challenge the browser must sign.
 * Spent on first use, so a captured response can never be replayed. `userId`
 * is set while registering and null for a sign-in, where nobody is known yet.
 */
export const customShellPasskeyChallenges = pgTable(
  "passkey_challenges",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    challenge: text("challenge").notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    userId: varchar("user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "cascade" }
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "passkey_challenges_type_check",
      sql`${table.type} in ('registration', 'authentication')`
    ),
    index("ix_passkey_challenges_expires_at").on(table.expiresAt),
  ]
)

/**
 * One row per AI call — the meter on the only pipe in this app that spends
 * money per click. Written by `recordAiUsage` (src/server/ai-usage.ts) and
 * never anywhere else; every call site goes through `runAiCall`, which
 * records failures too, so nothing runs unmeasured.
 *
 * `userId` is kept but not cascaded: deleting an account must not erase what
 * it spent, so the rows go anonymous instead. `costCents` is whole cents from
 * the price list in src/lib/ai-models.ts. `monthStart` is the first day of
 * the UTC month the call belongs to, always via `aiUsageMonthStart` —
 * indexed both ways the dashboard task will read it.
 */
export const customShellAiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    provider: varchar("provider", { length: 20 }).notNull(),
    model: varchar("model", { length: 120 }).notNull(),
    feature: varchar("feature", { length: 50 }).notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costCents: integer("cost_cents").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    monthStart: date("month_start").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "ai_usage_events_status_check",
      sql`${table.status} in ('success', 'failed', 'blocked')`
    ),
    index("ix_ai_usage_events_user_month").on(table.userId, table.monthStart),
    index("ix_ai_usage_events_month_created").on(
      table.monthStart,
      table.createdAt
    ),
  ]
)

/**
 * One row per person with their own monthly AI allowance instead of their
 * plan's. No row means "follow the plan"; zero is a real ceiling of nothing.
 */
export const customShellAiAllowanceOverrides = pgTable(
  "ai_allowance_overrides",
  {
    userId: varchar("user_id", { length: 36 })
      .primaryKey()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    monthlyCents: integer("monthly_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "ai_allowance_overrides_cents_check",
      sql`${table.monthlyCents} >= 0`
    ),
  ]
)

/**
 * One row per AI-allowance warning actually sent. The unique index is the
 * whole point: a burst of calls crossing 80% at once all try to insert the
 * same row, one wins, and only the winner sends the notification.
 */
export const customShellAiUsageAlerts = pgTable(
  "ai_usage_alerts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    monthStart: date("month_start").notNull(),
    level: varchar("level", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "ai_usage_alerts_level_check",
      sql`${table.level} in ('warning', 'reached')`
    ),
    uniqueIndex("ux_ai_usage_alerts_user_month_level").on(
      table.userId,
      table.monthStart,
      table.level
    ),
  ]
)

/**
 * The traffic tracker's permanent memory: one tiny counter row per UTC day.
 * Written only by `recordVisit` (src/server/traffic.ts). `uniqueVisitors` is
 * frozen in here as each day happens, so the hash rows it was counted from
 * can be thrown away when the day ends.
 */
export const customShellTrafficDailyTotals = pgTable("traffic_daily_totals", {
  day: date("day").primaryKey(),
  views: integer("views").notNull().default(0),
  memberViews: integer("member_views").notNull().default(0),
  visitorViews: integer("visitor_views").notNull().default(0),
  uniqueVisitors: integer("unique_visitors").notNull().default(0),
})

/**
 * Per-day view counts by page, referrer site and device, merged into one
 * table so there is one upsert shape and one index. The write path caps how
 * many distinct keys a day can have — overflow lands in '(other)' — so a bot
 * spraying URLs cannot grow this.
 */
export const customShellTrafficDailyFacts = pgTable(
  "traffic_daily_facts",
  {
    day: date("day").notNull(),
    dimension: varchar("dimension", { length: 20 }).notNull(),
    key: varchar("key", { length: 160 }).notNull(),
    views: integer("views").notNull().default(0),
  },
  (table) => [
    primaryKey({
      name: "traffic_daily_facts_pk",
      columns: [table.day, table.dimension, table.key],
    }),
    check(
      "traffic_daily_facts_dimension_check",
      sql`${table.dimension} in ('path', 'referrer', 'device')`
    ),
  ]
)

/**
 * The 7-day log of individual visits, swept by `pruneTrafficData`.
 * Deliberately no user id, IP, user agent or visitor hash — nothing on a row
 * can be tied back to a person once the day's salt is gone.
 */
export const customShellTrafficVisits = pgTable(
  "traffic_visits",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    path: varchar("path", { length: 160 }).notNull(),
    referrerDomain: varchar("referrer_domain", { length: 100 }).notNull(),
    device: varchar("device", { length: 10 }).notNull(),
    audience: varchar("audience", { length: 10 }).notNull(),
  },
  (table) => [
    check(
      "traffic_visits_device_check",
      sql`${table.device} in ('phone', 'tablet', 'computer')`
    ),
    check(
      "traffic_visits_audience_check",
      sql`${table.audience} in ('member', 'visitor')`
    ),
    index("ix_traffic_visits_occurred_at").on(table.occurredAt),
  ]
)

/**
 * One row per visitor hash per day — insert-on-conflict-do-nothing is the
 * unique-visitor dedup. Swept once the day has passed; the count survives in
 * the totals row.
 */
export const customShellTrafficVisitors = pgTable(
  "traffic_visitors",
  {
    day: date("day").notNull(),
    visitorHash: varchar("visitor_hash", { length: 64 }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "traffic_visitors_pk",
      columns: [table.day, table.visitorHash],
    }),
  ]
)

/**
 * The random ingredient in each day's visitor hashes, swept with the day —
 * which is what makes an old hash truly unrecoverable.
 */
export const customShellTrafficDaySalts = pgTable("traffic_day_salts", {
  day: date("day").primaryKey(),
  salt: varchar("salt", { length: 64 }).notNull(),
})

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
export type CustomShellDispute = typeof customShellDisputes.$inferSelect
export type CustomShellSubscriptionEvent =
  typeof customShellSubscriptionEvents.$inferSelect
export type CustomShellAutomation = typeof customShellAutomations.$inferSelect
export type CustomShellAnnouncement =
  typeof customShellAnnouncements.$inferSelect
