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
  ProjectColor,
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
