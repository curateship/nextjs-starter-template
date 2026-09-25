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
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

import { customShellMedia, customShellUsers } from "@/server/schema"

/**
 * The pomodoro app's own tables, apart from the shell's schema the way trade
 * and video keep theirs. Shapes are ported from the old app
 * (apps/pomoder/src/server/schema.ts) so its behaviour carries over row for
 * row. Migrations are handwritten SQL from 0082_pomodoro_* up.
 *
 * Dates are stored as the user's local calendar day (a `yyyy-mm-dd` string),
 * because a focus streak is about the day the person experienced, not the
 * server's midnight. The browser sends its timezone and the server derives
 * the day — see `localDateFor` in productivity.ts.
 */

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: varchar("user_id", { length: 36 })
      .primaryKey()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    focusMinutes: integer("focus_minutes").notNull().default(25),
    shortBreakMinutes: integer("short_break_minutes").notNull().default(5),
    longBreakMinutes: integer("long_break_minutes").notNull().default(15),
    dailyGoalSessions: integer("daily_goal_sessions").notNull().default(4),
    autoStart: boolean("auto_start").notNull().default(false),
    selectedSound: varchar("selected_sound", { length: 60 }),
    selectedBackground: varchar("selected_background", { length: 60 }),
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
      "preferences_goal_check",
      sql`${table.dailyGoalSessions} between 1 and 20`
    ),
  ]
)

/**
 * A project groups tasks at the level people bill and think at. Archiving is
 * a timestamp rather than a delete, because History keeps showing the hours a
 * finished project earned after it leaves the picker.
 */
export const pomodoroProjects = pgTable(
  "pomodoro_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("pomodoro_projects_user_idx").on(table.userId)]
)

/**
 * A task's repeat rule, held apart from the task because a task belongs to
 * one calendar day and a rule outlives every day it makes. `weekdays` is a
 * seven-bit set, bit 0 Sunday through bit 6 Saturday; every day is all seven
 * bits rather than a separate kind. "No repeat" is the absence of a row.
 */
export const pomodoroTaskRepeats = pgTable(
  "pomodoro_task_repeats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    priority: varchar("priority", { length: 10 }).notNull().default("normal"),
    estimatedPomodoros: integer("estimated_pomodoros"),
    projectId: uuid("project_id").references(() => pomodoroProjects.id, {
      onDelete: "set null",
    }),
    weekdays: integer("weekdays").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "pomodoro_task_repeats_priority_check",
      sql`${table.priority} in ('low', 'normal', 'high')`
    ),
    check(
      "pomodoro_task_repeats_estimate_check",
      sql`${table.estimatedPomodoros} is null or ${table.estimatedPomodoros} between 1 and 20`
    ),
    check(
      "pomodoro_task_repeats_weekdays_check",
      sql`${table.weekdays} between 1 and 127`
    ),
    index("pomodoro_task_repeats_user_idx").on(table.userId),
  ]
)

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    plannedDate: date("planned_date", { mode: "string" }).notNull(),
    pomodoroCount: integer("pomodoro_count").notNull().default(0),
    priority: varchar("priority", { length: 10 }).notNull().default("normal"),
    estimatedPomodoros: integer("estimated_pomodoros"),
    sortOrder: integer("sort_order").notNull().default(0),
    projectId: uuid("project_id").references(() => pomodoroProjects.id, {
      onDelete: "set null",
    }),
    /** The rule that makes this task each morning, when there is one. */
    repeatId: uuid("repeat_id").references(() => pomodoroTaskRepeats.id, {
      onDelete: "set null",
    }),
    /** Set when the rollover copies an unfinished task to a new day. */
    carriedToTaskId: uuid("carried_to_task_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    index("tasks_project_idx").on(table.projectId),
    // One task per rule per day, enforced here rather than in the rollover's
    // own check, because two tabs can load the day at the same moment.
    uniqueIndex("tasks_repeat_day_unique")
      .on(table.repeatId, table.plannedDate)
      .where(sql`${table.repeatId} is not null`),
  ]
)

export const focusSessions = pgTable(
  "focus_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** The task this focus counted towards; breaks always store null. */
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    /** Set when the session ran inside a focus room. */
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    // The old app's duplicate guard: a retried start with the same key finds
    // the session it already made instead of creating a second one.
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
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
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

export const pomodoroProfiles = pgTable("pomodoro_profiles", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => customShellUsers.id, { onDelete: "cascade" }),
  publicDisplayName: varchar("public_display_name", { length: 50 }),
  timezone: varchar("timezone", { length: 80 }).notNull().default("UTC"),
  leaderboardOptIn: boolean("leaderboard_opt_in").notNull().default(false),
  guestImportedAt: timestamp("guest_imported_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const userTimerPresets = pgTable(
  "user_timer_presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    focusMinutes: integer("focus_minutes").notNull(),
    shortBreakMinutes: integer("short_break_minutes").notNull(),
    longBreakMinutes: integer("long_break_minutes").notNull(),
    autoStart: boolean("auto_start").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "timer_presets_focus_check",
      sql`${table.focusMinutes} between 1 and 90`
    ),
    check(
      "timer_presets_short_check",
      sql`${table.shortBreakMinutes} between 1 and 90`
    ),
    check(
      "timer_presets_long_check",
      sql`${table.longBreakMinutes} between 1 and 90`
    ),
    unique("timer_presets_user_name_unique").on(table.userId, table.name),
  ]
)

export type UserPreferences = typeof userPreferences.$inferSelect
export type FocusSession = typeof focusSessions.$inferSelect
export type DailyFocusStat = typeof dailyFocusStats.$inferSelect
export type Task = typeof tasks.$inferSelect
export type PomodoroProject = typeof pomodoroProjects.$inferSelect
export type PomodoroTaskRepeat = typeof pomodoroTaskRepeats.$inferSelect
export type UserTimerPreset = typeof userTimerPresets.$inferSelect
export type PomodoroProfile = typeof pomodoroProfiles.$inferSelect

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostUserId: varchar("host_user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 80 }).notNull().unique(),
    name: varchar("name", { length: 80 }).notNull(),
    visibility: varchar("visibility", { length: 20 })
      .notNull()
      .default("public"),
    phase: varchar("phase", { length: 20 }).notNull().default("waiting"),
    /** Bumped by every phase change; stale timed transitions no-op on it. */
    sequence: integer("sequence").notNull().default(0),
    phaseStartedAt: timestamp("phase_started_at", { withTimezone: true }),
    phaseEndsAt: timestamp("phase_ends_at", { withTimezone: true }),
    focusMinutes: integer("focus_minutes").notNull().default(25),
    shortBreakMinutes: integer("short_break_minutes").notNull().default(5),
    longBreakMinutes: integer("long_break_minutes").notNull().default(15),
    autoStart: boolean("auto_start").notNull().default(false),
    cycleFocusCount: integer("cycle_focus_count").notNull().default(0),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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

export const roomMemberships = pgTable(
  "room_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
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
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
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

export const roomMessageReactions = pgTable(
  "room_message_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => roomMessages.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    emoji: varchar("emoji", { length: 16 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("room_message_reactions_message_user_emoji_unique").on(
      table.messageId,
      table.userId,
      table.emoji
    ),
    index("room_message_reactions_message_idx").on(table.messageId),
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
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    bannedByUserId: varchar("banned_by_user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id),
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
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => roomMessages.id, {
      onDelete: "set null",
    }),
    reason: varchar("reason", { length: 300 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    reviewedByUserId: varchar("reviewed_by_user_id", {
      length: 36,
    }).references(() => customShellUsers.id, { onDelete: "set null" }),
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

/**
 * Who did what, for every privileged act in the app: a host deleting a
 * message, removing or banning a member, and (with the admin sections) an
 * operator moving a report along. The old app wrote the shell's
 * `admin_audit_logs`; this shell has no such table, so the app owns one
 * rather than writing into shell-owned rows.
 *
 * `actorUserId` carries no foreign key on purpose: deleting an account must
 * not delete the record of what that account did.
 */
export const pomodoroAuditLogs = pgTable(
  "pomodoro_audit_logs",
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
    index("pomodoro_audit_logs_actor_created_idx").on(
      table.actorUserId,
      table.createdAt
    ),
    index("pomodoro_audit_logs_resource_created_idx").on(
      table.resource,
      table.createdAt
    ),
  ]
)

/**
 * A Pro member's own background or sound loop.
 *
 * The file and its record live in the shell's media library and its R2 bucket,
 * so this table holds only what the shell knows nothing about: which library
 * files belong to the pomodoro app, what the member meant each one for, and how
 * the re-encode is getting on. `mediaId` is the key, so one library file is at
 * most one pomodoro upload and deleting the library row takes this row with it.
 */
export const pomodoroMediaUploads = pgTable(
  "pomodoro_media_uploads",
  {
    mediaId: varchar("media_id", { length: 36 })
      .primaryKey()
      .references(() => customShellMedia.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    purpose: varchar("purpose", { length: 20 }).notNull(),
    kind: varchar("kind", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    /**
     * What the member actually sent. Kept after the re-encode replaces the
     * file, so the size the upload was accepted at is still on record.
     */
    originalBytes: bigint("original_bytes", { mode: "number" }).notNull(),
    failureReason: varchar("failure_reason", { length: 200 }),
    attempts: integer("attempts").notNull().default(0),
    /**
     * Set while a worker pass holds the job. A pass that dies leaves this
     * behind, so a stale claim is retried after a timeout rather than stuck.
     */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "pomodoro_media_uploads_purpose_check",
      sql`${table.purpose} in ('background', 'sound')`
    ),
    check(
      "pomodoro_media_uploads_kind_check",
      sql`${table.kind} in ('image', 'audio', 'video')`
    ),
    check(
      "pomodoro_media_uploads_status_check",
      sql`${table.status} in ('queued', 'processing', 'ready', 'failed')`
    ),
    check(
      "pomodoro_media_uploads_original_bytes_check",
      sql`${table.originalBytes} > 0`
    ),
    index("pomodoro_media_uploads_user_purpose_idx").on(
      table.userId,
      table.purpose,
      table.createdAt
    ),
    index("pomodoro_media_uploads_status_created_idx").on(
      table.status,
      table.createdAt
    ),
  ]
)

/**
 * What each person has spent on AI generation this month.
 *
 * `reserved - refunded` is what has actually been spent, so a failed job hands
 * the credit back without losing the record that the attempt happened. The
 * credit is taken when the request is accepted rather than when the file
 * arrives, so nobody can queue twenty videos while the first is still running.
 */
export const pomodoroGenerationUsage = pgTable(
  "pomodoro_generation_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** The first of the month, so a month is one comparable value. */
    month: date("month", { mode: "string" }).notNull(),
    kind: varchar("kind", { length: 20 }).notNull(),
    reserved: integer("reserved").notNull().default(0),
    completed: integer("completed").notNull().default(0),
    refunded: integer("refunded").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "pomodoro_generation_usage_kind_check",
      sql`${table.kind} in ('background', 'soundscape')`
    ),
    check(
      "pomodoro_generation_usage_counts_check",
      sql`${table.reserved} >= 0 and ${table.completed} >= 0 and ${table.refunded} >= 0`
    ),
    unique("pomodoro_generation_usage_unique").on(
      table.userId,
      table.month,
      table.kind
    ),
  ]
)

/**
 * One AI request, from the moment it is asked for until a file exists.
 *
 * `mediaId` stays null until then, which is why this cannot live on
 * `pomodoroMediaUploads`: that table is keyed by a library row, and for most of
 * a generation's life there is not one yet. Once the file lands it gets an
 * uploads row too, so the pickers, the serving and the delete all work on it
 * exactly as they do on something the member uploaded themselves.
 */
export const pomodoroGenerations = pgTable(
  "pomodoro_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 20 }).notNull(),
    prompt: varchar("prompt", { length: 500 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    /**
     * The month the credit came out of, so a refund goes back to the same
     * month even when the job finishes after midnight on the first.
     */
    month: date("month", { mode: "string" }).notNull(),
    mediaId: varchar("media_id", { length: 36 }).references(
      () => customShellMedia.id,
      { onDelete: "set null" }
    ),
    failureReason: varchar("failure_reason", { length: 200 }),
    attempts: integer("attempts").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "pomodoro_generations_kind_check",
      sql`${table.kind} in ('background', 'soundscape')`
    ),
    check(
      "pomodoro_generations_status_check",
      sql`${table.status} in ('queued', 'running', 'ready', 'failed')`
    ),
    index("pomodoro_generations_user_kind_idx").on(
      table.userId,
      table.kind,
      table.createdAt
    ),
    index("pomodoro_generations_status_created_idx").on(
      table.status,
      table.createdAt
    ),
  ]
)

export type Room = typeof rooms.$inferSelect
export type PomodoroMediaUpload = typeof pomodoroMediaUploads.$inferSelect
export type PomodoroGeneration = typeof pomodoroGenerations.$inferSelect
