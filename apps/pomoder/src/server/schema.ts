import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}

export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    publicDisplayName: varchar("public_display_name", { length: 50 }),
    leaderboardOptIn: boolean("leaderboard_opt_in").notNull().default(false),
    timezone: varchar("timezone", { length: 80 }).notNull().default("UTC"),
    role: varchar("role", { length: 50 }).notNull().default("user"),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    guestImportedAt: timestamp("guest_imported_at", { withTimezone: true }),
    avatarMediaId: uuid("avatar_media_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
    check("users_role_check", sql`${table.role} in ('user', 'admin')`),
  ]
)

export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_expiry_idx").on(table.expiresAt),
  ]
)

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    purpose: varchar("purpose", { length: 20 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "auth_tokens_purpose_check",
      sql`${table.purpose} in ('verify_email', 'reset_password')`
    ),
    index("auth_tokens_user_purpose_idx").on(table.userId, table.purpose),
  ]
)

export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 180 }).primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", {
    withTimezone: true,
  }).notNull(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: varchar("user_id", { length: 36 })
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    focusMinutes: integer("focus_minutes").notNull().default(25),
    shortBreakMinutes: integer("short_break_minutes").notNull().default(5),
    longBreakMinutes: integer("long_break_minutes").notNull().default(15),
    dailyGoalSessions: integer("daily_goal_sessions").notNull().default(4),
    autoStart: boolean("auto_start").notNull().default(false),
    selectedBackgroundId: uuid("selected_background_id"),
    selectedSound: varchar("selected_sound", { length: 60 }),
    soundVolume: integer("sound_volume").notNull().default(70),
    soundMuted: boolean("sound_muted").notNull().default(false),
    completionAlerts: boolean("completion_alerts").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "preferences_focus_check",
      sql`${table.focusMinutes} between 1 and 90`
    ),
    check(
      "preferences_short_check",
      sql`${table.shortBreakMinutes} between 1 and 90`
    ),
    check(
      "preferences_long_check",
      sql`${table.longBreakMinutes} between 1 and 90`
    ),
    check(
      "preferences_daily_goal_check",
      sql`${table.dailyGoalSessions} between 1 and 20`
    ),
    check(
      "preferences_sound_volume_check",
      sql`${table.soundVolume} between 0 and 100`
    ),
    check(
      "preferences_selected_sound_check",
      sql`${table.selectedSound} is null or ${table.selectedSound} ~ '^(curated:[a-z0-9_-]{1,40}|media:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'`
    ),
  ]
)

export const userTimerPresets = pgTable(
  "user_timer_presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    focusMinutes: integer("focus_minutes").notNull(),
    shortBreakMinutes: integer("short_break_minutes").notNull(),
    longBreakMinutes: integer("long_break_minutes").notNull(),
    autoStart: boolean("auto_start").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    unique("user_timer_presets_user_name_unique").on(table.userId, table.name),
    check(
      "user_timer_presets_name_check",
      sql`length(trim(${table.name})) between 1 and 60`
    ),
    check(
      "user_timer_presets_focus_check",
      sql`${table.focusMinutes} between 1 and 90`
    ),
    check(
      "user_timer_presets_short_check",
      sql`${table.shortBreakMinutes} between 1 and 90`
    ),
    check(
      "user_timer_presets_long_check",
      sql`${table.longBreakMinutes} between 1 and 90`
    ),
    index("user_timer_presets_user_idx").on(table.userId, table.createdAt),
  ]
)

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    plannedDate: date("planned_date", { mode: "string" }).notNull(),
    pomodoroCount: integer("pomodoro_count").notNull().default(0),
    priority: varchar("priority", { length: 10 }).notNull().default("normal"),
    estimatedPomodoros: integer("estimated_pomodoros"),
    sortOrder: integer("sort_order").notNull().default(0),
    carriedToTaskId: uuid("carried_to_task_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check(
      "tasks_status_check",
      sql`${table.status} in ('active', 'completed', 'carried', 'abandoned')`
    ),
    check(
      "tasks_priority_check",
      sql`${table.priority} in ('low', 'normal', 'high')`
    ),
    check(
      "tasks_estimated_pomodoros_check",
      sql`${table.estimatedPomodoros} is null or ${table.estimatedPomodoros} between 1 and 20`
    ),
    check("tasks_sort_order_check", sql`${table.sortOrder} >= 0`),
    index("tasks_user_date_idx").on(table.userId, table.plannedDate),
  ]
)

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostUserId: varchar("host_user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 80 }).notNull().unique(),
    name: varchar("name", { length: 80 }).notNull(),
    visibility: varchar("visibility", { length: 20 })
      .notNull()
      .default("public"),
    phase: varchar("phase", { length: 20 }).notNull().default("waiting"),
    sequence: integer("sequence").notNull().default(0),
    phaseStartedAt: timestamp("phase_started_at", { withTimezone: true }),
    phaseEndsAt: timestamp("phase_ends_at", { withTimezone: true }),
    focusMinutes: integer("focus_minutes").notNull().default(25),
    shortBreakMinutes: integer("short_break_minutes").notNull().default(5),
    longBreakMinutes: integer("long_break_minutes").notNull().default(15),
    autoStart: boolean("auto_start").notNull().default(false),
    cycleFocusCount: integer("cycle_focus_count").notNull().default(0),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check(
      "rooms_visibility_check",
      sql`${table.visibility} in ('public', 'unlisted')`
    ),
    check(
      "rooms_cycle_focus_count_check",
      sql`${table.cycleFocusCount} between 0 and 4`
    ),
    check(
      "rooms_phase_check",
      sql`${table.phase} in ('waiting', 'focus', 'short', 'long', 'closed')`
    ),
    index("rooms_public_idx").on(
      table.visibility,
      table.phase,
      table.createdAt
    ),
  ]
)

export const focusSessions = pgTable(
  "focus_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    roomId: uuid("room_id").references(() => rooms.id, {
      onDelete: "set null",
    }),
    mode: varchar("mode", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    plannedSeconds: integer("planned_seconds").notNull(),
    accumulatedSeconds: integer("accumulated_seconds").notNull().default(0),
    targetEndsAt: timestamp("target_ends_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "focus_sessions_mode_check",
      sql`${table.mode} in ('focus', 'short', 'long')`
    ),
    check(
      "focus_sessions_status_check",
      sql`${table.status} in ('running', 'paused', 'completed', 'cancelled')`
    ),
    unique("focus_sessions_user_idempotency_unique").on(
      table.userId,
      table.idempotencyKey
    ),
    index("focus_sessions_user_completed_idx").on(
      table.userId,
      table.completedAt
    ),
  ]
)

export const dailyFocusStats = pgTable(
  "daily_focus_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    localDate: date("local_date", { mode: "string" }).notNull(),
    focusSessions: integer("focus_sessions").notNull().default(0),
    focusSeconds: integer("focus_seconds").notNull().default(0),
    tasksCompleted: integer("tasks_completed").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("daily_focus_stats_user_date_unique").on(
      table.userId,
      table.localDate
    ),
    index("daily_focus_stats_date_idx").on(table.localDate),
  ]
)

export const roomMemberships = pgTable(
  "room_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "room_memberships_role_check",
      sql`${table.role} in ('host', 'member')`
    ),
    uniqueIndex("room_memberships_one_active_room_per_user")
      .on(table.userId)
      .where(sql`${table.leftAt} is null`),
    index("room_memberships_room_active_idx").on(table.roomId, table.leftAt),
  ]
)

export const roomMessages = pgTable(
  "room_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: varchar("body", { length: 500 }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("room_messages_room_created_idx").on(table.roomId, table.createdAt),
  ]
)

export const roomBans = pgTable(
  "room_bans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bannedByUserId: varchar("banned_by_user_id", { length: 36 })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("room_bans_room_user_unique").on(table.roomId, table.userId),
  ]
)

export const roomReports = pgTable(
  "room_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    reporterUserId: varchar("reporter_user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => roomMessages.id, {
      onDelete: "set null",
    }),
    reason: varchar("reason", { length: 300 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    reviewedByUserId: varchar("reviewed_by_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "set null" }
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "room_reports_status_check",
      sql`${table.status} in ('pending', 'resolved', 'dismissed')`
    ),
    uniqueIndex("room_reports_reporter_message_unique").on(
      table.reporterUserId,
      table.messageId
    ),
    index("room_reports_status_created_idx").on(table.status, table.createdAt),
  ]
)

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: varchar("owner_user_id", { length: 36 }).references(
      () => users.id,
      { onDelete: "cascade" }
    ),
    kind: varchar("kind", { length: 20 }).notNull(),
    source: varchar("source", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("ready"),
    name: varchar("name", { length: 100 }).notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    durationSeconds: integer("duration_seconds"),
    thumbnailKey: text("thumbnail_key"),
    prompt: varchar("prompt", { length: 500 }),
    provider: varchar("provider", { length: 30 }),
    providerJobId: varchar("provider_job_id", { length: 180 }),
    premium: boolean("premium").notNull().default(false),
    errorCode: varchar("error_code", { length: 60 }),
    ...timestamps,
  },
  (table) => [
    check(
      "media_assets_kind_check",
      sql`${table.kind} in ('image', 'video', 'audio')`
    ),
    check(
      "media_assets_source_check",
      sql`${table.source} in ('curated', 'upload', 'ai')`
    ),
    check(
      "media_assets_status_check",
      sql`${table.status} in ('queued', 'processing', 'ready', 'failed')`
    ),
    index("media_assets_owner_created_idx").on(
      table.ownerUserId,
      table.createdAt
    ),
  ]
)

export const generationUsage = pgTable(
  "generation_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    month: date("month", { mode: "string" }).notNull(),
    kind: varchar("kind", { length: 20 }).notNull(),
    reserved: integer("reserved").notNull().default(0),
    completed: integer("completed").notNull().default(0),
    refunded: integer("refunded").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "generation_usage_kind_check",
      sql`${table.kind} in ('background', 'soundscape')`
    ),
    unique("generation_usage_user_month_kind_unique").on(
      table.userId,
      table.month,
      table.kind
    ),
  ]
)

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 120 })
    .notNull()
    .unique(),
  stripeSubscriptionId: varchar("stripe_subscription_id", {
    length: 120,
  }).unique(),
  status: varchar("status", { length: 30 }).notNull(),
  priceId: varchar("price_id", { length: 120 }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  ...timestamps,
})

export const stripeEvents = pgTable("stripe_events", {
  eventId: varchar("event_id", { length: 120 }).primaryKey(),
  type: varchar("type", { length: 120 }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerId: varchar("worker_id", { length: 100 }).primaryKey(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  metadata: jsonb("metadata").notNull().default({}),
})

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: varchar("actor_user_id", { length: 36 }).notNull(),
    action: varchar("action", { length: 40 }).notNull(),
    resource: varchar("resource", { length: 30 }).notNull(),
    recordIds: jsonb("record_ids").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("admin_audit_logs_actor_created_idx").on(
      table.actorUserId,
      table.createdAt
    ),
  ]
)

export const storageDeletionJobs = pgTable(
  "storage_deletion_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key").notNull().unique(),
    attempts: integer("attempts").notNull().default(0),
    lastError: varchar("last_error", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("storage_deletion_jobs_created_idx").on(table.createdAt)]
)

// The established admin shell remains the management surface. These tables
// back its feedback, notification, workspace, settings, and legacy media tools.
export const customShellUsers = users
export const customShellSessions = sessions

export const customShellSettings = pgTable(
  "settings",
  {
    key: text("key").primaryKey(),
    settings: jsonb("settings").notNull(),
    ...timestamps,
  },
  (table) => [check("settings_default_key", sql`${table.key} = 'default'`)]
)

export const customShellWorkspaces = pgTable(
  "workspaces",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    settings: jsonb("settings").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (table) => [index("ix_workspaces_user_id").on(table.userId)]
)

export const customShellFeedback = pgTable(
  "feedback",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    message: text("message").notNull(),
    ...timestamps,
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
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => customShellFeedback.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    feedbackId: varchar("feedback_id", { length: 36 })
      .notNull()
      .references(() => customShellFeedback.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    ...timestamps,
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
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    recipientUserId: varchar("recipient_user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorUserId: varchar("actor_user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    index("ix_notifications_comment_id").on(table.feedbackCommentId),
  ]
)

export const customShellMedia = pgTable(
  "media",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
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
    ...timestamps,
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

export type User = typeof users.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Room = typeof rooms.$inferSelect
export type MediaAsset = typeof mediaAssets.$inferSelect
export type Subscription = typeof subscriptions.$inferSelect
export type CustomShellUser = typeof customShellUsers.$inferSelect
export type CustomShellWorkspace = typeof customShellWorkspaces.$inferSelect
export type CustomShellMedia = typeof customShellMedia.$inferSelect
export type CustomShellFeedback = typeof customShellFeedback.$inferSelect
export type CustomShellFeedbackComment =
  typeof customShellFeedbackComments.$inferSelect
export type CustomShellNotification =
  typeof customShellNotifications.$inferSelect
