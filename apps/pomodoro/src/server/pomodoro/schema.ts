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

import type { PublicSocialLink } from "@/lib/pages/public-social"
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
    /** How many focuses earn the long break. Part of the saved rhythm. */
    sessionsBeforeLongBreak: integer("sessions_before_long_break")
      .notNull()
      .default(4),
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
    check(
      "preferences_long_break_cycle_check",
      sql`${table.sessionsBeforeLongBreak} between 2 and 8`
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
    /**
     * Whether this project's name and hours may appear on the owner's public
     * profile. Off for every project that exists and every one made from now
     * on; a project becomes public only because somebody ticked it.
     *
     * A project name is often a client's name, so the default is the whole
     * safety of it. No migration ever turns one on.
     */
    isPublic: boolean("is_public").notNull().default(false),
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
    /**
     * One line about what the focus was for, written after it finishes.
     * Private to the account: only the owner's own History reads it, and the
     * admin sessions dashboard names its columns and leaves this one out.
     */
    note: varchar("note", { length: 120 }),
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

/**
 * One row per badge a person has earned, and the moment they earned it.
 *
 * Only the earning is stored. What the badges are and what each one takes
 * lives in code (`@/lib/pomodoro/achievements`), because a badge is a promise
 * the app made rather than data an account owns.
 *
 * The unique index is what makes "awarded exactly once" true. The award check
 * inserts every badge the counters satisfy and lets the index throw the
 * repeats away, so a hundredth session finishing twice, or two tabs finishing
 * one each, still leaves one row with the first date on it.
 */
export const pomodoroAchievements = pgTable(
  "pomodoro_achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    badgeId: varchar("badge_id", { length: 40 }).notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("pomodoro_achievements_user_badge_unique").on(
      table.userId,
      table.badgeId
    ),
  ]
)

/**
 * One account blocking another, in one direction.
 *
 * A block is checked by `isBlockedBetween` in `@/server/pomodoro/blocks`, and
 * by nothing else. Every list of people in this app calls that one function,
 * because a block that holds on the profile page and leaks through the
 * leaderboard is four separate bugs rather than one.
 *
 * There is no cap. Tyler's call, 2 Oct 2026: a block is self-protection and
 * refusing one has a real cost to the person being harassed.
 */
export const pomodoroBlocks = pgTable(
  "pomodoro_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerUserId: varchar("blocker_user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    blockedUserId: varchar("blocked_user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Blocking twice is the same block, decided by the index rather than by a
    // read-then-write that two tabs could both pass.
    uniqueIndex("pomodoro_blocks_pair_unique").on(
      table.blockerUserId,
      table.blockedUserId
    ),
    index("pomodoro_blocks_blocked_idx").on(table.blockedUserId),
  ]
)

/**
 * A one-way follow. No invite, no approval, and nothing for the followed
 * person to accept.
 *
 * Capped at 200 followed accounts. Tyler's call, 2 Oct 2026: far above what
 * anybody reaches in normal use, and low enough that one account cannot
 * follow every member to scrape the list.
 */
export const pomodoroFollows = pgTable(
  "pomodoro_follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followerUserId: varchar("follower_user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    followedUserId: varchar("followed_user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // What makes a double-pressed Follow one row, the way the achievements
    // index makes a twice-earned badge one row.
    uniqueIndex("pomodoro_follows_pair_unique").on(
      table.followerUserId,
      table.followedUserId
    ),
    index("pomodoro_follows_followed_idx").on(table.followedUserId),
    check(
      "pomodoro_follows_not_self_check",
      sql`${table.followerUserId} <> ${table.followedUserId}`
    ),
  ]
)

/**
 * One cheer: a canned line sent to somebody you follow.
 *
 * The row exists to count the daily cap per pair, and to be the thing an
 * operator could look at if this were ever abused. Nothing here is typed by
 * anybody, so there is no text to moderate.
 */
export const pomodoroCheers = pgTable(
  "pomodoro_cheers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromUserId: varchar("from_user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    toUserId: varchar("to_user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    /** One of the fixed ids in `@/lib/pomodoro/cheers`, never free text. */
    cheerId: varchar("cheer_id", { length: 40 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("pomodoro_cheers_pair_created_idx").on(
      table.fromUserId,
      table.toUserId,
      table.createdAt
    ),
  ]
)

export const pomodoroProfiles = pgTable(
  "pomodoro_profiles",
  {
    userId: varchar("user_id", { length: 36 })
      .primaryKey()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    publicDisplayName: varchar("public_display_name", { length: 50 }),
    timezone: varchar("timezone", { length: 80 }).notNull().default("UTC"),
    leaderboardOptIn: boolean("leaderboard_opt_in").notNull().default(false),
    /**
     * The secret in the public streak badge's address. Null is off, which is
     * the default, so a badge only ever exists because someone asked for one.
     * Turning it off clears the column, which is what kills the old link;
     * asking for a new link writes a new secret and kills the old one the
     * same way.
     */
    streakBadgeToken: varchar("streak_badge_token", { length: 64 }),
    /**
     * The one public address for this person, `/u/<handle>`. Null until they
     * pick one. Always stored lowercase, because a handle is an address and
     * two addresses differing only in case would be two doors to one page.
     */
    handle: varchar("handle", { length: 30 }),
    /**
     * Whether `/u/<handle>` answers at all. Off by default, so a handle
     * reserved today publishes nothing until its owner says so, and switching
     * it off makes the page 404 exactly as an unknown handle does.
     */
    profilePublic: boolean("profile_public").notNull().default(false),
    /** A few lines about the person. Drawn as text, never as markup. */
    bio: varchar("bio", { length: 280 }),
    /**
     * The person's own social accounts, in the same shape the site-wide
     * footer setting uses, so `normalizePublicSocialLinks` is the one reader
     * for both. Re-normalised on the way out as well as in, so a hand-edited
     * row cannot put a `javascript:` address on a page.
     */
    socialLinks: jsonb("social_links")
      .$type<PublicSocialLink[]>()
      .notNull()
      .default([]),
    /**
     * The strip behind the name: `scene:<key>` for one of the eight built-in
     * scenes, `media:<uuid>` for the person's own upload, null for none. The
     * same spelling `user_preferences.selected_background` uses, parsed by
     * the same function, so nothing a browser sends can become a URL.
     */
    bannerRef: varchar("banner_ref", { length: 80 }),
    /**
     * Up to three badge ids drawn larger above the rest. Ids the account has
     * not earned, and ids that are no longer badges at all, are ignored when
     * the page is built rather than drawn as a gap.
     */
    pinnedBadges: jsonb("pinned_badges")
      .$type<string[]>()
      .notNull()
      .default([]),
    /**
     * One switch per publishable section, each off by default. The server
     * reads a section only when its switch is on, so a section that is off is
     * never in the page's data for anybody to find in the network tab.
     *
     * The bio, the links and the picture have no switch of their own: they
     * are the profile, and they ride on `profilePublic`.
     */
    showFigures: boolean("show_figures").notNull().default(false),
    showBadges: boolean("show_badges").notNull().default(false),
    showHeatmap: boolean("show_heatmap").notNull().default(false),
    showProjects: boolean("show_projects").notNull().default(false),
    showFocusingNow: boolean("show_focusing_now").notNull().default(false),
    showRoom: boolean("show_room").notNull().default(false),
    /**
     * Whether this profile appears on `/people`. A second switch on top of
     * `profilePublic`, because "I want a page" and "I want to be in a
     * directory" are different wishes — the same reasoning that keeps the
     * group board and the global board apart.
     */
    listed: boolean("listed").notNull().default(false),
    /**
     * Whether this person accepts cheers. On by default, because a cheer is
     * one of a fixed set of canned lines from somebody they already allow to
     * follow them, and off is one press away.
     */
    cheersEnabled: boolean("cheers_enabled").notNull().default(true),
    /**
     * Set when an operator hides a reported profile. The public read tests
     * it, so a hidden profile answers 404 exactly as a switched-off one does,
     * and the owner is told on their own Settings card rather than left
     * thinking the app broke.
     */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    guestImportedAt: timestamp("guest_imported_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Unique so one address can never resolve to two accounts, and partial so
    // the many accounts with no badge do not all collide on null.
    uniqueIndex("pomodoro_profiles_streak_badge_token_unique")
      .on(table.streakBadgeToken)
      .where(sql`${table.streakBadgeToken} is not null`),
    // Same shape, same reason: one handle is one account, and the accounts
    // with no handle must not all collide on null.
    uniqueIndex("pomodoro_profiles_handle_unique")
      .on(table.handle)
      .where(sql`${table.handle} is not null`),
    // The database's own last word on the shape, so a handle with a slash or
    // a NUL byte in it cannot be written even by a hand-run statement.
    check(
      "pomodoro_profiles_handle_shape_check",
      sql`${table.handle} is null or ${table.handle} ~ '^[a-z0-9_-]{3,30}$'`
    ),
  ]
)

/**
 * A private focus group: a name, an owner and the secret in its invite link.
 *
 * There is no ranking stored here. A group board is the leaderboard query
 * filtered to this group's members (`src/server/pomodoro/leaderboard.ts`), so
 * the figures on a group board and the global one can never disagree.
 *
 * The token is never null, unlike the streak badge's: a group always has a
 * link. Replacing it is what kills a leaked one.
 */
export const pomodoroGroups = pgTable(
  "pomodoro_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: varchar("owner_user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    joinToken: varchar("join_token", { length: 64 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("pomodoro_groups_owner_idx").on(table.ownerUserId)]
)

/**
 * One row per person in a group, the owner included.
 *
 * The unique pair is what makes "in a group once" true, so following an invite
 * link twice leaves one row rather than two entries on the board.
 */
export const pomodoroGroupMembers = pgTable(
  "pomodoro_group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => pomodoroGroups.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => customShellUsers.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("pomodoro_group_members_group_user_unique").on(
      table.groupId,
      table.userId
    ),
    index("pomodoro_group_members_user_idx").on(table.userId),
  ]
)

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
    /** The preset owns the long-break cycle, the same as its durations. */
    sessionsBeforeLongBreak: integer("sessions_before_long_break")
      .notNull()
      .default(4),
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
    check(
      "timer_presets_long_break_cycle_check",
      sql`${table.sessionsBeforeLongBreak} between 2 and 8`
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
export type PomodoroAchievement = typeof pomodoroAchievements.$inferSelect
export type PomodoroGroup = typeof pomodoroGroups.$inferSelect
export type PomodoroGroupMember = typeof pomodoroGroupMembers.$inferSelect

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
    /**
     * When a booked room opens itself. Null on a room started by hand, which
     * is every room made before scheduling existed. Set alongside the
     * 'scheduled' phase and left in place afterwards, so an opened room still
     * says what time it was booked for.
     */
    startsAt: timestamp("starts_at", { withTimezone: true }),
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
      sql`${table.phase} in ('scheduled', 'waiting', 'focus', 'short', 'long', 'closed')`
    ),
    // A room waiting for its own clock must say when that clock goes off,
    // otherwise nothing would ever open it.
    check(
      "rooms_scheduled_starts_at_check",
      sql`${table.phase} <> 'scheduled' or ${table.startsAt} is not null`
    ),
    index("rooms_public_idx").on(
      table.visibility,
      table.phase,
      table.createdAt
    ),
    index("rooms_scheduled_idx").on(table.phase, table.startsAt),
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

/**
 * One invitation email for a booked room: who it goes to and what became of
 * it. The row is written when the host books the room and the worker sends
 * it on the next pass, so cancelling in between means the email never leaves.
 *
 * The address is stored lowercased and unique per room, so a host who types
 * the same person twice invites them once.
 */
export const roomInvites = pgTable(
  "room_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 254 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    /** Claimed by the sender before it sends, so two passes cannot both send. */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failureReason: varchar("failure_reason", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "room_invites_status_check",
      sql`${table.status} in ('queued', 'sent', 'failed', 'cancelled')`
    ),
    unique("room_invites_room_email_unique").on(table.roomId, table.email),
    index("room_invites_status_created_idx").on(table.status, table.createdAt),
  ]
)

export const roomReports = pgTable(
  "room_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * What is being reported. `message` is a room message, which is every row
     * written before public profiles existed and the reason this column
     * defaults to it.
     */
    kind: varchar("kind", { length: 20 }).notNull().default("message"),
    /** Null on a profile report, which belongs to no room. */
    roomId: uuid("room_id").references(() => rooms.id, {
      onDelete: "cascade",
    }),
    /**
     * Null when a signed-out reader reported a public profile. The page is
     * public and most of its readers have no account, so a report that
     * required one would mostly not be filed.
     */
    reporterUserId: varchar("reporter_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "cascade" }
    ),
    /** Whose profile was reported. Null on a message report. */
    profileUserId: varchar("profile_user_id", { length: 36 }).references(
      () => customShellUsers.id,
      { onDelete: "cascade" }
    ),
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
export type RoomInvite = typeof roomInvites.$inferSelect
export type PomodoroMediaUpload = typeof pomodoroMediaUploads.$inferSelect
export type PomodoroGeneration = typeof pomodoroGenerations.$inferSelect
