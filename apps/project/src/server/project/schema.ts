import {
  boolean,
  date,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"

import type {
  CheckinItemKind,
  ProjectColor,
  TaskEventKind,
  TaskStatus,
  TeamInviteRole,
  TeamRole,
} from "@/lib/project/rules"
import { customShellNotifications, customShellUsers } from "@/server/schema"

/**
 * Project's own tables, kept apart from the shell's `src/server/schema.ts` on
 * purpose: that file belongs to the shell and editing it would fork this app
 * off future shell merges. The SQL that creates them is
 * `drizzle/0094_project_teams_projects_tasks.sql`; this file only describes
 * them to the query builder.
 *
 * The team is the top level. Project has no workspaces.
 */

const userRef = () => customShellUsers.id
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull()

export const projectTeams = pgTable("project_teams", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: text("name").notNull(),
  checkinTime: varchar("checkin_time", { length: 5 }).notNull(),
  timeZone: text("time_zone").notNull(),
  workDays: smallint("work_days").array().notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const projectTeamMembers = pgTable(
  "project_team_members",
  {
    teamId: varchar("team_id", { length: 36 })
      .notNull()
      .references(() => projectTeams.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).$type<TeamRole>().notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
    /** The person's own check-in time, "HH:MM". Null uses the team's. */
    checkinTime: varchar("checkin_time", { length: 5 }),
    /** The person's own time zone. Null uses the team's. */
    timeZone: text("time_zone"),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId] })]
)

export const projectTeamInvites = pgTable("project_team_invites", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 })
    .notNull()
    .references(() => projectTeams.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: varchar("role", { length: 16 }).$type<TeamInviteRole>().notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  invitedByUserId: varchar("invited_by_user_id", { length: 36 }).references(
    userRef,
    { onDelete: "set null" }
  ),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
})

export const projectProjects = pgTable("project_projects", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 })
    .notNull()
    .references(() => projectTeams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: varchar("color", { length: 16 }).$type<ProjectColor>().notNull(),
  description: text("description").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
    userRef,
    { onDelete: "set null" }
  ),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const projectProjectMembers = pgTable(
  "project_project_members",
  {
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projectProjects.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })]
)

export const projectTasks = pgTable("project_tasks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 })
    .notNull()
    .references(() => projectProjects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  notes: text("notes").notNull(),
  status: varchar("status", { length: 16 }).$type<TaskStatus>().notNull(),
  stuckReason: text("stuck_reason"),
  assigneeUserId: varchar("assignee_user_id", { length: 36 }).references(
    userRef,
    { onDelete: "set null" }
  ),
  assignedByUserId: varchar("assigned_by_user_id", { length: 36 }).references(
    userRef,
    { onDelete: "set null" }
  ),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  handedBackReason: text("handed_back_reason"),
  handedBackByUserId: varchar("handed_back_by_user_id", {
    length: 36,
  }).references(userRef, { onDelete: "set null" }),
  formerAssigneeName: text("former_assignee_name"),
  dueDate: date("due_date", { mode: "string" }),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(
    userRef,
    { onDelete: "set null" }
  ),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

export const projectTaskSteps = pgTable("project_task_steps", {
  id: varchar("id", { length: 36 }).primaryKey(),
  taskId: varchar("task_id", { length: 36 })
    .notNull()
    .references(() => projectTasks.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  done: boolean("done").notNull(),
  position: integer("position").notNull(),
  createdAt: createdAt(),
})

export const projectTaskComments = pgTable("project_task_comments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  taskId: varchar("task_id", { length: 36 })
    .notNull()
    .references(() => projectTasks.id, { onDelete: "cascade" }),
  authorUserId: varchar("author_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  body: text("body").notNull(),
  createdAt: createdAt(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  /** A deleted message keeps its place with no words (`drizzle/0097_project_task_chat_and_files.sql`). */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
})

/** Who each chat message tagged with @. */
export const projectCommentMentions = pgTable(
  "project_comment_mentions",
  {
    commentId: varchar("comment_id", { length: 36 })
      .notNull()
      .references(() => projectTaskComments.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.commentId, table.userId] })]
)

/** People who get a task's chat, Stuck and Done notices without being assigned. */
export const projectTaskFollowers = pgTable(
  "project_task_followers",
  {
    taskId: varchar("task_id", { length: 36 })
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.userId] })]
)

/** A file on a task. `storagePath` is the bucket key and never leaves the server. */
export const projectTaskFiles = pgTable("project_task_files", {
  id: varchar("id", { length: 36 }).primaryKey(),
  taskId: varchar("task_id", { length: 36 })
    .notNull()
    .references(() => projectTasks.id, { onDelete: "cascade" }),
  teamId: varchar("team_id", { length: 36 })
    .notNull()
    .references(() => projectTeams.id, { onDelete: "cascade" }),
  uploadedByUserId: varchar("uploaded_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storagePath: text("storage_path").notNull(),
  createdAt: createdAt(),
})

export const projectNoticeLinks = pgTable("project_notice_links", {
  noticeId: varchar("notice_id", { length: 36 })
    .primaryKey()
    .references(() => customShellNotifications.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 32 }).notNull(),
  href: text("href").notNull(),
})

export const projectNavigationAdded = pgTable("project_navigation_added", {
  scope: varchar("scope", { length: 80 }).primaryKey(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
})

/**
 * One row per person per day of their own calendar
 * (`drizzle/0095_project_checkins.sql`). A row with no `checkedInAt` is a day
 * the person didn't check in, written by the end-of-day job.
 */
export const projectCheckins = pgTable("project_checkins", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 })
    .notNull()
    .references(() => projectTeams.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(userRef, { onDelete: "cascade" }),
  day: date("day", { mode: "string" }).notNull(),
  timeZone: text("time_zone").notNull(),
  workDay: boolean("work_day").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: createdAt(),
})

/** Each task picked on a check-in, and each one dropped from the last one. */
export const projectCheckinItems = pgTable("project_checkin_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  checkinId: varchar("checkin_id", { length: 36 })
    .notNull()
    .references(() => projectCheckins.id, { onDelete: "cascade" }),
  taskId: varchar("task_id", { length: 36 }).references(() => projectTasks.id, {
    onDelete: "set null",
  }),
  projectId: varchar("project_id", { length: 36 }).references(() => projectProjects.id, {
    onDelete: "set null",
  }),
  taskTitle: text("task_title").notNull(),
  kind: varchar("kind", { length: 8 }).$type<CheckinItemKind>().notNull(),
  carriedOver: boolean("carried_over").notNull(),
  reason: text("reason"),
  endStatus: varchar("end_status", { length: 16 }).$type<TaskStatus>(),
  createdAt: createdAt(),
})

/** One check-in reminder per person per day, written before the bell notice. */
export const projectCheckinReminders = pgTable(
  "project_checkin_reminders",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })]
)

/**
 * Handing a task over, accepting it and handing it back, saved as they happen
 * (`drizzle/0096_project_task_events.sql`) for the task's history.
 */
export const projectTaskEvents = pgTable("project_task_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  taskId: varchar("task_id", { length: 36 })
    .notNull()
    .references(() => projectTasks.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 16 }).$type<TaskEventKind>().notNull(),
  actorUserId: varchar("actor_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  targetUserId: varchar("target_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  reason: text("reason"),
  createdAt: createdAt(),
})
