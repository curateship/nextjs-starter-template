import { sql } from "drizzle-orm"

import type { AutomationCompiledConfig } from "@/lib/automations/compile"
import type { AutomationGraph } from "@/lib/automations/graph"
import type { AutomationRunOutput } from "@/lib/automations/node-descriptor"
import type {
  AutomationApprovalDecision,
  AutomationRunStatus,
  AutomationRunStepStatus,
  AutomationTriggerFacts,
} from "@/lib/automations/run"
import type { PlanFeatures } from "@/lib/billing/plan-features"
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
import type { WorkspaceStatus } from "@/lib/workspaces/status"

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
     * When this account's first free trial began, and null while it has never
     * had one. Set once by the Stripe webhook the moment a trial actually
     * starts — not at checkout, or an abandoned checkout would burn it — and
     * never overwritten, because the question it answers is "have they already
     * had one" and the first trial is the answer to it.
     *
     * Checkout reads it and leaves the trial days off when it is set, so
     * cancelling and subscribing again no longer restarts the free trial.
     */
    firstTrialAt: timestamp("first_trial_at", { withTimezone: true }),
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
    /**
     * The workspace this person is looking at, or empty when they have not
     * picked one.
     *
     * On the person, not on the workspace. It used to be `is_default` on the
     * workspace row, which could only hold one person's opinion of it — so two
     * admins sharing a workspace cleared each other's choice every time either
     * of them switched. Empty is an ordinary state: a new account is in it
     * until it picks one.
     */
    currentWorkspaceId: varchar("current_workspace_id", { length: 36 }),
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

/**
 * Small, searchable labels admins and automations attach to accounts.
 *
 * One row per label keeps exact audience lookups indexed and lets the user
 * foreign key remove every label when the account itself is removed.
 */
export const customShellMemberTags = pgTable(
  "member_tags",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "member_tags_pk",
      columns: [table.userId, table.tag],
    }),
    check(
      "member_tags_normalized_check",
      sql`${table.tag} = lower(trim(${table.tag})) and length(${table.tag}) between 1 and 100 and position(',' in ${table.tag}) = 0`
    ),
    index("ix_member_tags_tag_user").on(table.tag, table.userId),
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
  (table) => [check("settings_default_key", sql`${table.key} = 'default'`)]
)

export const customShellWorkspaces = pgTable(
  "workspaces",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /**
     * Who made this workspace, and empty once they are gone.
     *
     * Deliberately not the thing that owns it. A workspace holds contacts,
     * segments, broadcasts and email settings, and while this cascaded, deleting
     * one account took all of that with it — silently, from the schema, with
     * nothing in `account-deletion.ts` saying so. It sets to null instead, so a
     * workspace outlives the person who made it.
     */
    userId: varchar("user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    name: varchar("name", { length: 255 }).notNull(),
    /** The label this workspace answers on, in front of the base domain. */
    subdomain: varchar("subdomain", { length: 63 }).notNull(),
    /**
     * A domain of its own, stored bare — no scheme, no port, no `www.` —
     * because that is the shape an incoming host is reduced to before it is
     * matched. Empty means it answers only on its subdomain.
     */
    customDomain: varchar("custom_domain", { length: 253 })
      .notNull()
      .default(""),
    /**
     * `active` and `draft` both answer a visitor; `inactive` looks like the
     * workspace never existed. Draft answers on purpose — it is how a site is
     * looked at before anybody is told about it.
     */
    status: varchar("status", { length: 20 })
      .$type<WorkspaceStatus>()
      .notNull()
      .default("active"),
    settings: jsonb("settings").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_workspaces_user_id").on(table.userId),
    uniqueIndex("ux_workspaces_subdomain").on(table.subdomain),
    uniqueIndex("ux_workspaces_custom_domain")
      .on(table.customDomain)
      .where(sql`${table.customDomain} <> ''`),
    check(
      "workspaces_status_check",
      sql`${table.status} in ('active', 'inactive', 'draft')`
    ),
  ]
)

export const customShellFeedback = pgTable(
  "feedback",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /**
     * The site it was left on. Feedback about one site is that site's roadmap,
     * and its votes and replies follow it through the parent row.
     */
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    /** Where the item sits on the roadmap; every new item starts open. */
    status: varchar("status", { length: 20 }).notNull().default("open"),
    message: text("message").notNull(),
    // What the item is about, from the fixed list in `lib/feedback/feedback-tags.ts`.
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /**
     * One optional screenshot, kept as a media row under the author's account.
     * Deleting that media row only clears this — the feedback survives its
     * picture — while deleting the feedback takes the file with it.
     */
    attachmentMediaId: varchar("attachment_media_id", {
      length: 36,
    }).references(() => customShellMedia.id, { onDelete: "set null" }),
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
    index("ix_feedback_workspace_created").on(
      table.workspaceId,
      table.createdAt
    ),
    index("ix_feedback_workspace_type").on(table.workspaceId, table.type),
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
    unique("feedback_votes_unique_user").on(table.feedbackId, table.userId),
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
    /** Set on an approval or failure notice; deleting the run clears it too. */
    automationRunId: varchar("automation_run_id", { length: 36 }).references(
      () => customShellAutomationRuns.id,
      { onDelete: "cascade" }
    ),
    /**
     * 'pending' when the run parks and 'timed_out' when the deadline
     * auto-rejects it. Both notices are about the same run, so without this the
     * second would read exactly like the first.
     */
    automationApprovalState: varchar("automation_approval_state", {
      length: 20,
    }).$type<"pending" | "timed_out">(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "notifications_type_check",
      sql`${table.type} in ('feedback_vote', 'feedback_comment', 'feedback_merged', 'changelog', 'announcement', 'ai_limit_warning', 'ai_limit_reached', 'automation_approval', 'automation_failed')`
    ),
    index("ix_notifications_recipient_created").on(
      table.recipientUserId,
      table.createdAt
    ),
    index("ix_notifications_feedback_id").on(table.feedbackId),
    index("ix_notifications_vote_id").on(table.feedbackVoteId),
    index("ix_notifications_comment_id").on(table.feedbackCommentId),
    index("ix_notifications_changelog_entry_id").on(table.changelogEntryId),
    index("ix_notifications_automation_run_id").on(table.automationRunId),
    // One notice per person per announcement, so a second tab loading at the
    // same moment cannot write a duplicate. Partial: every other kind of notice
    // leaves this column null and there can be many of those.
    uniqueIndex("ux_notifications_announcement_recipient")
      .on(table.announcementId, table.recipientUserId)
      .where(sql`${table.announcementId} is not null`),
    // A failed run may be observed more than once after a worker crash, but
    // each admin gets one alert for it and no more.
    uniqueIndex("ux_notifications_automation_failure_recipient")
      .on(table.automationRunId, table.recipientUserId)
      .where(sql`${table.type} = 'automation_failed'`),
  ]
)

export const customShellAnnouncements = pgTable(
  "announcements",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /** The site this banner is for. Another site's visitors never see it. */
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    /** How loud the banner looks: info, warning or critical. */
    level: varchar("level", { length: 20 }).notNull().default("info"),
    /** App-only unless an admin deliberately includes signed-out visitors. */
    audience: varchar("audience", { length: 20 })
      .$type<"app" | "everyone">()
      .notNull()
      .default("app"),
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
    check(
      "announcements_audience_check",
      sql`${table.audience} in ('app', 'everyone')`
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
    index("ix_announcements_workspace_window").on(
      table.workspaceId,
      table.startsAt,
      table.endsAt
    ),
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
    /**
     * The site this file belongs to, which is the site it was uploaded on.
     *
     * The library and the picker read by this and nothing else, so a photo
     * uploaded for one site is never offered to another. `userId` stays beside
     * it and still means the person who uploaded it — it is what an avatar and
     * a feedback screenshot are checked against, and those are personal rather
     * than the site's.
     */
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
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
      sql`${table.fileType} in ('image', 'video', 'audio')`
    ),
    index("ix_media_user_id").on(table.userId),
    index("ix_media_file_type").on(table.fileType),
    index("ix_media_created_at").on(table.createdAt),
    index("ix_media_workspace_user_created").on(
      table.workspaceId,
      table.userId,
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
      sql`${table.purpose} in ('verify_email', 'reset_password', 'login', 'change_email', 'revoke_email_change')`
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
/**
 * The browsers an account has signed in from before, so the "new device" alert
 * goes out once per device instead of once per sign-in.
 *
 * Sessions cannot answer this — a session row is deleted on sign-out, so the
 * same laptop would look new every time. The label is the coarse readable one
 * (`describeDevice`), which is what keeps the alert rare enough to be read.
 */
export const customShellKnownDevices = pgTable(
  "known_devices",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ux_known_devices_user_label").on(table.userId, table.label),
  ]
)

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
    check(
      "oauth_accounts_provider_check",
      sql`${table.provider} in ('google')`
    ),
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
    features: jsonb("features").$type<PlanFeatures>().notNull().default({}),
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
    /**
     * Set while the plan is on hold: Stripe is not billing it and the account
     * is treated as being on the free plan. Null means running as usual. Kept
     * apart from `status` because Stripe's own status stays "active" through a
     * pause and overwrites that column on every webhook.
     */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
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

/** What members optionally tell us when they stop a paid plan renewing. */
export const customShellCancellations = pgTable(
  "cancellations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    planId: varchar("plan_id", { length: 36 }).references(
      () => customShellPlans.id,
      { onDelete: "set null" }
    ),
    planName: varchar("plan_name", { length: 120 }),
    reason: varchar("reason", { length: 40 }),
    feedback: varchar("feedback", { length: 500 }),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "cancellations_reason_check",
      sql`${table.reason} is null or ${table.reason} in ('too_expensive', 'missing_features', 'hard_to_use', 'not_using_enough', 'temporary', 'other')`
    ),
    index("ix_cancellations_user_created").on(
      table.userId,
      table.createdAt.desc()
    ),
    index("ix_cancellations_ends_at").on(table.endsAt),
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
    /** Our vocabulary, worded by `lib/billing/subscription-events.ts`. */
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

export const customShellAutomations = pgTable(
  "automations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /**
     * The site whose flow this is.
     *
     * A run reads it when it starts, rather than asking the author which site
     * they are in — which is what used to happen, and meant an admin switching
     * site changed what a flow already under way would do.
     */
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    /**
     * Who wrote it, and empty once they are gone.
     *
     * Deliberately not the thing that owns it — the workspace above is. This
     * used to cascade, so deleting one admin's account deleted their flows and
     * every run those flows had ever done. A flow is a thing the site has.
     */
    userId: varchar("user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    name: varchar("name", { length: 80 }).notNull(),
    /** The editor's draft: nodes, edges, viewport — saved as the user drew it. */
    graph: jsonb("graph").$type<AutomationGraph>().notNull(),
    /**
     * The compile-on-save result, null whenever the draft has validation
     * errors. Only a fresh server-side compile may write this column; the run
     * engine (a later task) reads exclusively from it, never from `graph`.
     */
    compiledConfig: jsonb("compiled_config").$type<AutomationCompiledConfig>(),
    /**
     * Whether this flow's trigger is live. Off until somebody says otherwise,
     * including for every flow that existed before triggers did.
     *
     * Only ever about the trigger. Pressing Run by hand works either way — that
     * is a person asking for it, and this switch is about the flow acting on
     * its own.
     */
    enabled: boolean("enabled").notNull().default(false),
    /** Why a safety check switched this flow off; cleared by the next manual toggle. */
    pausedReason: text("paused_reason"),
    /** The next scheduled occurrence, null while off or without a Time trigger. */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("automations_workspace_name_unique").on(
      table.workspaceId,
      table.name
    ),
    index("ix_automations_workspace_updated").on(
      table.workspaceId,
      table.updatedAt
    ),
    index("ix_automations_next_run")
      .on(table.nextRunAt)
      .where(sql`${table.nextRunAt} is not null`),
  ]
)

/** Permanent once-per-member memory for member lifecycle flows. */
export const customShellAutomationMemberEventEnrollments = pgTable(
  "automation_member_event_enrollments",
  {
    automationId: varchar("automation_id", { length: 36 })
      .notNull()
      .references(() => customShellAutomations.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    event: varchar("event", { length: 20 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.automationId, table.userId, table.event] }),
    check(
      "automation_member_event_enrollments_event_check",
      sql`${table.event} in ('registered', 'verified', 'subscribed', 'canceled')`
    ),
    index("ix_automation_member_event_enrollments_user").on(table.userId),
  ]
)

/**
 * One admin's saved version of a built-in automation template.
 *
 * No row means "use the built-in". Resetting a template deletes its row, so
 * the code constant remains the single reset point and never has to be copied
 * into every database just to say nothing changed.
 */
export const customShellAutomationTemplateOverrides = pgTable(
  "automation_template_overrides",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    templateKey: varchar("template_key", { length: 64 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: varchar("description", { length: 300 }).notNull(),
    graph: jsonb("graph").$type<AutomationGraph>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("automation_template_overrides_user_key_unique").on(
      table.userId,
      table.templateKey
    ),
    index("ix_automation_template_overrides_user_updated").on(
      table.userId,
      table.updatedAt
    ),
  ]
)

/**
 * When a periodic trigger look last happened, one row per kind of look.
 *
 * A trial ending and a card running out are dates passing, and nothing tells us
 * about a date passing — they are found by looking. The card look asks Stripe
 * about every paying member, so it must be a daily job on a fifteen-second
 * ticker. See `server/automations/triggers.ts` for how a scan is claimed.
 */
export const customShellAutomationTriggerScans = pgTable(
  "automation_trigger_scans",
  {
    kind: varchar("kind", { length: 64 }).primaryKey(),
    lastScannedAt: timestamp("last_scanned_at", {
      withTimezone: true,
    }).notNull(),
  }
)

/**
 * One time a flow was set going. See `drizzle/0028` for why a run holds a claim
 * rather than a lock, why it carries its own copy of the compiled flow, and why
 * a run parked at an approval checkpoint costs the engine nothing.
 */
export const customShellAutomationRuns = pgTable(
  "automation_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    automationId: varchar("automation_id", { length: 36 })
      .notNull()
      .references(() => customShellAutomations.id, { onDelete: "cascade" }),
    /** Who wrote the flow, and empty once they are gone — as on the flow. */
    userId: varchar("user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    /**
     * Which workspace this run is for, fixed when it started.
     *
     * The engine used to work it out from the owner's *current* workspace every
     * time it woke, so switching workspace silently changed who a running flow
     * would email. Empty only on runs that predate this column.
     */
    workspaceId: varchar("workspace_id", { length: 36 }).references(
      () => customShellWorkspaces.id,
      { onDelete: "cascade" }
    ),
    status: varchar("status", { length: 20 })
      .$type<AutomationRunStatus>()
      .notNull(),
    currentNodeId: varchar("current_node_id", { length: 64 }).notNull(),
    /** The compiled flow as it was when the run started, never re-read after. */
    configSnapshot: jsonb("config_snapshot")
      .$type<AutomationCompiledConfig>()
      .notNull(),
    wakeAt: timestamp("wake_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    claimToken: varchar("claim_token", { length: 36 }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    error: text("error"),
    /** All five null until the run reaches an approval checkpoint. */
    approvalNodeId: varchar("approval_node_id", { length: 64 }),
    approvalSummary: text("approval_summary"),
    approvalDeadlineAt: timestamp("approval_deadline_at", {
      withTimezone: true,
    }),
    approvalDecision: varchar("approval_decision", {
      length: 20,
    }).$type<AutomationApprovalDecision>(),
    approvalDecidedAt: timestamp("approval_decided_at", { withTimezone: true }),
    /** Null when the deadline decided it rather than a person. */
    approvalDecidedBy: varchar("approval_decided_by", {
      length: 36,
    }).references(() => customShellUsers.id, { onDelete: "set null" }),
    /**
     * Who the run is about — never the same person as `userId`, which is the
     * admin who owns the flow. Null for a run somebody started by hand.
     *
     * The reference clears rather than cascades: an account being deleted must
     * not take the record of what was done to them with it. `subjectLabel` is
     * the copy that survives it, and it is a copy on purpose — a renamed
     * person's old runs still read as they did on the day.
     */
    subjectUserId: varchar("subject_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    subjectLabel: varchar("subject_label", { length: 200 }),
    /** The contact itself, including an address that has no account behind it. */
    subjectContactId: varchar("subject_contact_id", { length: 36 }).references(
      () => customShellContacts.id,
      { onDelete: "set null" }
    ),
    /**
     * A rehearsal against `subjectUserId`. Outside actions are redirected or
     * skipped, and the copied address is the only address an email may reach.
     */
    testRun: boolean("test_run").notNull().default(false),
    testRecipientEmail: varchar("test_recipient_email", { length: 255 }),
    /** The node kind that started it, so the history can name the moment. */
    triggerKind: varchar("trigger_kind", { length: 64 }),
    /**
     * The one thing this run was started for — a failed invoice, one trial's
     * end date, one card in one billing period. Unique per automation, which is
     * what makes a webhook delivered twice or two servers scanning at once
     * start one run rather than two. Null for a run started by hand.
     */
    triggerKey: varchar("trigger_key", { length: 200 }),
    /** What happened, in the plain values the steps after the trigger read. */
    triggerFacts: jsonb("trigger_facts").$type<AutomationTriggerFacts>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "automation_runs_status_check",
      sql`${table.status} in ('active', 'waiting_approval', 'completed', 'failed', 'rejected', 'canceled')`
    ),
    uniqueIndex("ux_automation_runs_trigger_key")
      .on(table.automationId, table.triggerKey)
      .where(sql`${table.triggerKey} is not null`),
    index("ix_automation_runs_subject").on(table.subjectUserId),
    index("ix_automation_runs_subject_contact").on(table.subjectContactId),
    check(
      "automation_runs_decision_check",
      sql`${table.approvalDecision} is null or ${table.approvalDecision} in ('approved', 'rejected', 'timed_out')`
    ),
    check(
      "automation_runs_test_recipient_check",
      sql`${table.testRun} = (${table.testRecipientEmail} is not null) and (${table.testRun} = false or ${table.subjectUserId} is not null)`
    ),
    index("ix_automation_runs_status_wake").on(table.status, table.wakeAt),
    index("ix_automation_runs_workspace_started").on(
      table.workspaceId,
      table.startedAt
    ),
    index("ix_automation_runs_automation").on(table.automationId),
  ]
)

/** What one step did, written once when the step is over. Never edited. */
export const customShellAutomationRunSteps = pgTable(
  "automation_run_steps",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runId: varchar("run_id", { length: 36 })
      .notNull()
      .references(() => customShellAutomationRuns.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 64 }).notNull(),
    status: varchar("status", { length: 20 })
      .$type<AutomationRunStepStatus>()
      .notNull(),
    attempts: integer("attempts").notNull().default(1),
    /** What the step did, in the words a person would use. Always present. */
    summary: text("summary").notNull(),
    /** Small JSON-only data for a node's optional rich run-history view. */
    output: jsonb("output").$type<AutomationRunOutput>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "automation_run_steps_status_check",
      sql`${table.status} in ('completed', 'failed', 'rejected')`
    ),
    index("ix_automation_run_steps_run").on(table.runId, table.startedAt),
  ]
)

/**
 * Pages an admin wrote, as opposed to pages the code declares.
 *
 * The rest of the Pages batch is settings — a page exists because a
 * `*.page.ts` sits beside a route. This holds the words themselves, which is
 * why it is the one part of that batch with a table.
 *
 * `body` is the editor's document tree, never HTML: the public page draws it
 * by turning named nodes into elements, so nothing here is ever handed to a
 * browser as markup. See `lib/pages/written-page-body.ts`.
 *
 * Whether a written page is switched on lives where every other page's does —
 * the app-wide settings row, keyed by address — so there is one switch rather
 * than one per kind of page.
 */
export const customShellWrittenPages = pgTable(
  "written_pages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /** The site this page is part of. Its address is only its own within that. */
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    /** The address it answers on, always starting with "/". */
    path: varchar("path", { length: 160 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: jsonb("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    // Two written pages **on one site** cannot claim one address even if both
    // saves land at the same moment. Alpha and Beta each having an `/about` is
    // ordinary, and is the reason the workspace leads this index. A clash with
    // a code page is refused in the server, which is the only place that knows
    // both lists.
    uniqueIndex("ux_written_pages_workspace_path").on(
      table.workspaceId,
      table.path
    ),
  ]
)

export const customShellChangelogEntries = pgTable(
  "changelog_entries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /** The site whose updates these are. */
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    /** Null while the entry is a draft. Only published entries reach members. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ix_changelog_entries_workspace_published").on(
      table.workspaceId,
      table.publishedAt
    ),
  ]
)

/**
 * One API key per AI provider ("anthropic" | "openai"), app-wide. `apiKey` is
 * never the key as typed: it is the AES-256-GCM output of
 * `encryptSecret` (`src/server/auth/encryption.ts`), stored as
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
 * money per click. Written by `recordAiUsage` (src/server/ai/usage.ts) and
 * never anywhere else; every call site goes through `runAiCall`, which
 * records failures too, so nothing runs unmeasured.
 *
 * `userId` is kept but not cascaded: deleting an account must not erase what
 * it spent, so the rows go anonymous instead. `costCents` is whole cents from
 * the price list in src/lib/ai/ai-models.ts. `monthStart` is the first day of
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
export const customShellTrafficDailyTotals = pgTable(
  "traffic_daily_totals",
  {
    /** The site these are the figures for. Part of the key, not beside it. */
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    views: integer("views").notNull().default(0),
    memberViews: integer("member_views").notNull().default(0),
    visitorViews: integer("visitor_views").notNull().default(0),
    uniqueVisitors: integer("unique_visitors").notNull().default(0),
  },
  (table) => [
    primaryKey({
      name: "traffic_daily_totals_pkey",
      columns: [table.workspaceId, table.day],
    }),
  ]
)

/**
 * Per-day view counts by page, referrer site and device, merged into one
 * table so there is one upsert shape and one index. The write path caps how
 * many distinct keys a day can have — overflow lands in '(other)' — so a bot
 * spraying URLs cannot grow this.
 */
export const customShellTrafficDailyFacts = pgTable(
  "traffic_daily_facts",
  {
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    dimension: varchar("dimension", { length: 20 }).notNull(),
    key: varchar("key", { length: 160 }).notNull(),
    views: integer("views").notNull().default(0),
  },
  (table) => [
    primaryKey({
      name: "traffic_daily_facts_pk",
      columns: [table.workspaceId, table.day, table.dimension, table.key],
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
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
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
    index("ix_traffic_visits_workspace_occurred").on(
      table.workspaceId,
      table.occurredAt
    ),
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
    /**
     * Per site, so "unique visitors" means unique to this site. One person
     * reading two of the deployment's sites is one visitor on each, which is
     * what each site's own figure should say.
     */
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    visitorHash: varchar("visitor_hash", { length: 64 }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "traffic_visitors_pk",
      columns: [table.workspaceId, table.day, table.visitorHash],
    }),
  ]
)

/**
 * The random ingredient in each day's visitor hashes, swept with the day —
 * which is what makes an old hash truly unrecoverable.
 *
 * **One salt for the whole deployment, shared across every site, decided
 * rather than inherited.** Its job is to stop a visitor being followed from one
 * day to the next, and it does that whether or not sites share it.
 *
 * Giving each site its own would mean the same person reading two of the
 * deployment's sites hashed differently on each. That sounds like more privacy
 * and buys none: the hash never leaves this deployment and is thrown away
 * nightly either way. What it would cost is real — each site would count that
 * person separately, which is exactly right, and it already does, because the
 * *visitor* rows are per site while the salt is not. Splitting the salt as well
 * would change nothing a visitor can feel and add a table's worth of rows.
 */
export const customShellTrafficDaySalts = pgTable("traffic_day_salts", {
  day: date("day").primaryKey(),
  salt: varchar("salt", { length: 64 }).notNull(),
})

/**
 * Everyone a newsletter can go to. Scoped to a workspace, and unique on the
 * email address case-insensitively — two contacts with the same address is how
 * a list starts sending people the same thing twice.
 */
export const customShellContacts = pgTable(
  "contacts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    /**
     * The account this contact is, when it is one.
     *
     * Almost every contact is a member of the app, and those rows are kept in
     * step with the account by `syncContactsFromUsers` — the account is the
     * truth about the address and the name. Null is somebody who has no
     * account: an address added by hand, which still has to be mailable.
     *
     * Not a join at send time on purpose. Deliveries point at a contact id,
     * and that id is what makes sending exactly once work, so the contact row
     * has to keep existing in its own right.
     */
    userId: varchar("user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "cascade" }
    ),
    email: varchar("email", { length: 255 }).notNull(),
    firstName: varchar("first_name", { length: 255 }),
    lastName: varchar("last_name", { length: 255 }),
    /** Where they came from — an account, an import, added by hand. */
    source: varchar("source", { length: 255 }),
    /** The segments they belong to. A broadcast can go to one or more tags. */
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: varchar("status", { length: 20 }).notNull().default("subscribed"),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "contacts_status_check",
      // 'bounced' and 'complained' arrive by Resend webhook, never by hand.
      sql`${table.status} in ('subscribed', 'unsubscribed', 'bounced', 'complained')`
    ),
    uniqueIndex("ux_contacts_workspace_email").on(
      table.workspaceId,
      sql`lower(${table.email})`
    ),
    // One contact per account, so the sync cannot end up adding a second row
    // for somebody every time it runs.
    uniqueIndex("ux_contacts_workspace_user")
      .on(table.workspaceId, table.userId)
      .where(sql`${table.userId} is not null`),
    index("ix_contacts_workspace_created").on(
      table.workspaceId,
      table.createdAt
    ),
  ]
)

/**
 * One person one Send Email step tried to reach.
 *
 * A row is reserved before the provider call, and the unique address rule is
 * the retry safety: if a worker dies after Resend accepts a message, the next
 * attempt finds this row and does not send the same message again. The copied
 * address and subject keep the useful part of the paper trail when a contact
 * or account is later deleted.
 */
export const customShellAutomationDeliveries = pgTable(
  "automation_deliveries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    runId: varchar("run_id", { length: 36 })
      .notNull()
      .references(() => customShellAutomationRuns.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id", { length: 64 }).notNull(),
    contactId: varchar("contact_id", { length: 36 }).references(
      () => customShellContacts.id,
      { onDelete: "set null" }
    ),
    userId: varchar("user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "set null" }
    ),
    toEmail: varchar("to_email", { length: 255 }).notNull(),
    subject: text("subject").notNull(),
    /** Resend's id, used to match later delivery, open and click events. */
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull(),
    error: text("error"),
    /** When Resend says the recipient's mail server accepted the message. */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /** First open Resend reported. This is an estimate, not proof of reading. */
    openedAt: timestamp("opened_at", { withTimezone: true }),
    /** First link click Resend reported. */
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "automation_deliveries_status_check",
      sql`${table.status} in ('sent', 'failed')`
    ),
    index("ix_automation_deliveries_run").on(table.runId, table.createdAt),
    index("ix_automation_deliveries_contact").on(table.contactId),
    index("ix_automation_deliveries_user").on(table.userId),
    index("ix_automation_deliveries_provider_message").on(
      table.providerMessageId
    ),
    uniqueIndex("ux_automation_deliveries_run_node_contact")
      .on(table.runId, table.nodeId, table.contactId)
      .where(sql`${table.contactId} is not null`),
    uniqueIndex("ux_automation_deliveries_run_node_email").on(
      table.runId,
      table.nodeId,
      sql`lower(${table.toEmail})`
    ),
  ]
)

/**
 * A group of contacts named once, so everything that has to say who something
 * is for can point at the name instead of describing the group again.
 *
 * `kind` is the whole design:
 *
 * - `rules` — the conditions live in `rules` and the people are never saved.
 *   Worked out fresh every time anything asks, which is what makes somebody who
 *   unsubscribed this morning drop out of it this afternoon with nobody having
 *   to remember. See `src/server/people/contact-segments.ts`.
 * - `static` — the people were hand-picked and live in
 *   `customShellContactSegmentMembers`, for the one-off list no rule describes.
 */
export const customShellContactSegments = pgTable(
  "contact_segments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description").notNull().default(""),
    kind: varchar("kind", { length: 20 }).notNull().default("rules"),
    /** A flat list of conditions, all of which have to be true. */
    rules: jsonb("rules")
      .notNull()
      .default(sql`'{"conditions":[]}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "contact_segments_kind_check",
      sql`${table.kind} in ('rules', 'static')`
    ),
    // Case-insensitively unique: "Paying members" and "paying members" are the
    // same group to a reader, and a list holding both is one nobody can point
    // at with confidence.
    uniqueIndex("ux_contact_segments_workspace_name").on(
      table.workspaceId,
      sql`lower(${table.name})`
    ),
    index("ix_contact_segments_workspace").on(table.workspaceId),
  ]
)

/**
 * Who is in a hand-picked segment. Empty for a rules segment, always.
 *
 * Both sides cascade: deleting the segment takes its membership with it, and a
 * deleted contact stops being in every segment at once rather than leaving rows
 * pointing at nobody.
 */
export const customShellContactSegmentMembers = pgTable(
  "contact_segment_members",
  {
    segmentId: varchar("segment_id", { length: 36 })
      .notNull()
      .references(() => customShellContactSegments.id, { onDelete: "cascade" }),
    contactId: varchar("contact_id", { length: 36 })
      .notNull()
      .references(() => customShellContacts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "contact_segment_members_pk",
      columns: [table.segmentId, table.contactId],
    }),
    // "Which segments is this person in" — the direction the key above cannot
    // answer.
    index("ix_contact_segment_members_contact").on(table.contactId),
  ]
)

/** The last successfully observed segment for one live flow. */
export const customShellAutomationSegmentWatches = pgTable(
  "automation_segment_watches",
  {
    automationId: varchar("automation_id", { length: 36 })
      .primaryKey()
      .references(() => customShellAutomations.id, { onDelete: "cascade" }),
    segmentId: varchar("segment_id", { length: 36 })
      .notNull()
      .references(() => customShellContactSegments.id, { onDelete: "cascade" }),
    lastScannedAt: timestamp("last_scanned_at", {
      withTimezone: true,
    }).notNull(),
  },
  (table) => [
    index("ix_automation_segment_watches_segment").on(table.segmentId),
  ]
)

/** Who matched at the last look; rows disappear when a contact leaves. */
export const customShellAutomationSegmentSnapshot = pgTable(
  "automation_segment_snapshot",
  {
    automationId: varchar("automation_id", { length: 36 })
      .notNull()
      .references(() => customShellAutomations.id, { onDelete: "cascade" }),
    segmentId: varchar("segment_id", { length: 36 })
      .notNull()
      .references(() => customShellContactSegments.id, { onDelete: "cascade" }),
    contactId: varchar("contact_id", { length: 36 })
      .notNull()
      .references(() => customShellContacts.id, { onDelete: "cascade" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "automation_segment_snapshot_pk",
      columns: [table.automationId, table.contactId],
    }),
    index("ix_automation_segment_snapshot_segment").on(table.segmentId),
  ]
)

/** Permanent once-per-contact memory, independent of deletable run history. */
export const customShellAutomationSegmentEnrollments = pgTable(
  "automation_segment_enrollments",
  {
    automationId: varchar("automation_id", { length: 36 })
      .notNull()
      .references(() => customShellAutomations.id, { onDelete: "cascade" }),
    contactId: varchar("contact_id", { length: 36 })
      .notNull()
      .references(() => customShellContacts.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "automation_segment_enrollments_pk",
      columns: [table.automationId, table.contactId],
    }),
  ]
)

/**
 * One email written out of blocks, and everything about sending it.
 *
 * `claimToken` / `claimedAt` are the same claim the automation runs use: a
 * ticker stamps its own token on a batch of due broadcasts and only writes
 * back to rows still carrying it, so two servers ticking at once cannot both
 * deliver the same batch. A server that dies leaves a claim that goes stale
 * and is picked up again.
 *
 * `renderedHtml` is frozen when the send starts. Editing the blocks afterwards
 * cannot change what a send in flight is putting in people's inboxes.
 */
export const customShellBroadcasts = pgTable(
  "broadcasts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    subject: text("subject").notNull().default(""),
    /** The grey line the inbox shows after the subject. */
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
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    /** When the next batch may go. Null means "as soon as the ticker gets to it". */
    nextBatchAt: timestamp("next_batch_at", { withTimezone: true }),
    /**
     * How fast this one goes out — see `src/lib/broadcasts/drip.ts`. Null, and
     * anything that no longer parses, means the whole list goes as fast as the
     * server can send it, which is how this app behaved before drip existed.
     */
    dripConfig: jsonb("drip_config"),
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
      "broadcasts_status_check",
      sql`${table.status} in ('draft', 'scheduled', 'sending', 'paused', 'sent')`
    ),
    index("ix_broadcasts_workspace_status").on(table.workspaceId, table.status),
    index("ix_broadcasts_status_next_batch").on(
      table.status,
      table.nextBatchAt
    ),
  ]
)

/** A saved set of blocks, so a built email can start the next one. */
export const customShellBroadcastTemplates = pgTable(
  "broadcast_templates",
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
    index("ix_broadcast_templates_workspace").on(table.workspaceId),
    // Only one template can be the one new broadcasts start from.
    uniqueIndex("ux_broadcast_templates_default")
      .on(table.workspaceId)
      .where(sql`${table.isDefault}`),
  ]
)

/**
 * One row per person per broadcast, written the moment the send is attempted.
 *
 * The unique index below is the whole exactly-once guarantee. Not a counter,
 * not a cursor — the database itself refuses a second row for the same person
 * on the same broadcast, so an interrupted send that is picked up again cannot
 * mail anybody twice however it is resumed.
 */
export const customShellDeliveries = pgTable(
  "deliveries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    // SET NULL, not CASCADE: deleting a broadcast must not erase the record of
    // what was already sent to real people.
    broadcastId: varchar("broadcast_id", { length: 36 }).references(
      () => customShellBroadcasts.id,
      { onDelete: "set null" }
    ),
    contactId: varchar("contact_id", { length: 36 })
      .notNull()
      .references(() => customShellContacts.id, { onDelete: "cascade" }),
    toEmail: varchar("to_email", { length: 255 }).notNull(),
    subject: text("subject").notNull(),
    /** Resend's id for the message, so a bounce can be traced back. */
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull(),
    /**
     * Stamped when Resend reports this message bounced.
     *
     * Not a third `status` value: that column says what happened when the
     * message was handed over, and is already written by the time a bounce
     * arrives. Two separate facts, two separate columns.
     */
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "deliveries_status_check",
      sql`${table.status} in ('sent', 'failed')`
    ),
    index("ix_deliveries_workspace_created").on(
      table.workspaceId,
      table.createdAt
    ),
    index("ix_deliveries_contact").on(table.contactId),
    /**
     * "Has this person been sent anything since…", asked once per contact by
     * the segment rules about sending history.
     *
     * All three columns, in this order, so the question is answered out of the
     * index without touching a single row: workspace and contact narrow it,
     * and the date is then already sorted underneath. Measured on 20,000
     * contacts and 200,000 sends, with three segments using the rule — 2,100ms
     * without it, 175ms with it.
     *
     * The `deliveries` index above is not the same thing and is still needed:
     * it starts at the contact, so it answers "everything sent to this one
     * person" for the details window.
     */
    index("ix_deliveries_workspace_contact_created").on(
      table.workspaceId,
      table.contactId,
      table.createdAt
    ),
    index("ix_deliveries_broadcast").on(table.broadcastId),
    uniqueIndex("ux_deliveries_broadcast_contact")
      .on(table.broadcastId, table.contactId)
      .where(sql`${table.broadcastId} is not null`),
  ]
)

/**
 * The wording of a site's own emails — verify your address, reset your
 * password, and the rest.
 *
 * **Per site.** This used to say the opposite, and the reason it gave was "a
 * workspace belongs to one person, and somebody clicking verify-my-email has no
 * workspace" — true, and beside the point. The email is not sent on the
 * reader's behalf; it is sent on the site's, the one they registered on, which
 * is the domain they were looking at. That is a question with an answer, and a
 * confirmation email that names the wrong business is the plainest way to lose
 * somebody's trust.
 *
 * A site that has never touched these falls back to the shell's built-in
 * wording, exactly as an app with one site always did.
 *
 * A missing row is the normal state and means "use the built-in wording". One
 * is written the first time somebody opens that email in the editor.
 */
export const customShellSystemEmails = pgTable(
  "system_emails",
  {
    workspaceId: varchar("workspace_id", { length: 36 })
      .notNull()
      .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
    /** One of SYSTEM_EMAIL_KINDS — see src/lib/system-emails/kinds.ts. */
    kind: varchar("kind", { length: 60 }).notNull(),
    subject: text("subject").notNull().default(""),
    preheader: text("preheader").notNull().default(""),
    fromName: varchar("from_name", { length: 255 }),
    blocks: jsonb("blocks")
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Kept in step with the blocks on every save, as a broadcast's is. */
    renderedHtml: text("rendered_html"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "system_emails_pkey",
      columns: [table.workspaceId, table.kind],
    }),
  ]
)

/**
 * Every attempt at one of the app's own emails, sent or failed.
 *
 * Deliberately not the `deliveries` table. That one's `contact_id` is required
 * and its unique index on (broadcast, contact) is the newsletter's exactly-once
 * guarantee — but these go to people who are not contacts, and the same person
 * asks for a new password link as often as they like. Sharing the table would
 * mean either weakening that index or refusing the second reset email.
 */
export const customShellSystemEmailSends = pgTable(
  "system_email_sends",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    /**
     * Which site's email went out, and empty when there was no site yet.
     *
     * Optional on purpose: the first person to register on a fresh install is
     * sent a verification email before any admin has signed in, so before a
     * site exists. Requiring this would drop the record of exactly the emails
     * somebody is most likely to chase.
     */
    workspaceId: varchar("workspace_id", { length: 36 }).references(
      () => customShellWorkspaces.id,
      { onDelete: "cascade" }
    ),
    kind: varchar("kind", { length: 60 }).notNull(),
    toEmail: varchar("to_email", { length: 255 }).notNull(),
    subject: text("subject").notNull(),
    /** Resend's id for the message, so a bounce can be traced back. */
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "system_email_sends_status_check",
      sql`${table.status} in ('sent', 'failed')`
    ),
    index("ix_system_email_sends_kind_created").on(table.kind, table.createdAt),
  ]
)

/** Who a workspace's email comes from, and the key it sends with. */
export const customShellEmailSettings = pgTable("email_settings", {
  workspaceId: varchar("workspace_id", { length: 36 })
    .primaryKey()
    .references(() => customShellWorkspaces.id, { onDelete: "cascade" }),
  // Encrypted with `encryptSecret`, never read back to the browser.
  resendApiKeyEncrypted: text("resend_api_key_encrypted"),
  /**
   * The signing secret of the Resend webhook that reports bounces and spam
   * complaints back to `/api/webhooks/resend`. Encrypted like the key above.
   */
  resendWebhookSecretEncrypted: text("resend_webhook_secret_encrypted"),
  fromEmail: varchar("from_email", { length: 255 }),
  fromName: varchar("from_name", { length: 255 }),
  /**
   * The drip rules a newly created newsletter starts from — see
   * `src/lib/broadcasts/drip.ts`. Only ever read at that moment; changing it
   * later leaves newsletters that already exist alone.
   */
  dripDefaults: jsonb("drip_defaults"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

/**
 * The app's Stripe keys: a live set and a sandbox set, and which is in use.
 * One row for the whole app (id is always "stripe"). Secrets are encrypted
 * with `encryptSecret` and never read back to the browser; publishable keys
 * are public by design.
 *
 * **App-wide is a live decision, revisited when sites arrived, not an
 * assumption nobody looked at again.** Per-site keys are only worth having when
 * the sites take their own money into their own Stripe accounts — a deployment
 * running several brands for one business bills through one account, and
 * splitting the keys would buy it nothing but a second place to paste a secret
 * and a second webhook to get wrong.
 *
 * What tips it the other way is a deployment where the sites belong to
 * *different* businesses. Nothing in the shell does that yet: plans and
 * subscriptions are app-wide too, so per-site keys alone would leave money
 * arriving against a plan that belongs to everybody. Splitting this table is
 * the last step of that job, not the first, and doing it early would look
 * finished while being wrong.
 */
export const customShellStripeSettings = pgTable("stripe_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  useSandbox: boolean("use_sandbox").notNull().default(false),
  liveSecretKeyEncrypted: text("live_secret_key_encrypted"),
  livePublishableKey: text("live_publishable_key"),
  liveWebhookSecretEncrypted: text("live_webhook_secret_encrypted"),
  sandboxSecretKeyEncrypted: text("sandbox_secret_key_encrypted"),
  sandboxPublishableKey: text("sandbox_publishable_key"),
  sandboxWebhookSecretEncrypted: text("sandbox_webhook_secret_encrypted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
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
export type CustomShellSubscriptionEvent =
  typeof customShellSubscriptionEvents.$inferSelect
export type CustomShellAutomation = typeof customShellAutomations.$inferSelect
export type CustomShellAutomationRun =
  typeof customShellAutomationRuns.$inferSelect
export type CustomShellAutomationRunStep =
  typeof customShellAutomationRunSteps.$inferSelect
export type CustomShellAutomationDelivery =
  typeof customShellAutomationDeliveries.$inferSelect
export type CustomShellAnnouncement =
  typeof customShellAnnouncements.$inferSelect
export type CustomShellContact = typeof customShellContacts.$inferSelect
export type CustomShellContactSegment =
  typeof customShellContactSegments.$inferSelect
export type CustomShellBroadcast = typeof customShellBroadcasts.$inferSelect
export type CustomShellBroadcastTemplate =
  typeof customShellBroadcastTemplates.$inferSelect
export type CustomShellDelivery = typeof customShellDeliveries.$inferSelect
export type CustomShellEmailSettings =
  typeof customShellEmailSettings.$inferSelect
export type CustomShellStripeSettings =
  typeof customShellStripeSettings.$inferSelect
