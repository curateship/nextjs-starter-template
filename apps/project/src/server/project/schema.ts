import {
  boolean,
  date,
  integer,
  jsonb,
  type AnyPgColumn,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"

import type {
  CheckinItemKind,
  CheckinNoteField,
  DueReminderKind,
  MeetingAnswer,
  MeetingRepeat,
  ProjectColor,
  ProjectHealth,
  Reaction,
  RepeatEvery,
  TaskEventKind,
  TaskPriority,
  TaskStatus,
  TeamRole,
} from "@/lib/project/rules"
import type { SavedViewFilters, SavedViewNames } from "@/lib/project/saved-views"
import type { TemplateContent } from "@/lib/project/templates"
import type { FieldKind, FieldSettings, WhoCanChange } from "@/lib/project/task-fields"
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
  /** A fingerprint of the join link's secret, never the link itself. */
  joinTokenHash: varchar("join_token_hash", { length: 64 }),
  joinExpiresAt: timestamp("join_expires_at", { withTimezone: true }),
  /** The team's photo, a media library address (`drizzle/0105_project_team_dashboard.sql`). */
  photoUrl: text("photo_url"),
  /** The team's square avatar beside its name; null shows its initials (`drizzle/0120_project_team_avatar.sql`). */
  avatarUrl: text("avatar_url"),
  /** The team's own words for the check-in's boxes; null keeps the usual ones (`drizzle/0106_project_checkin_and_handing_out.sql`). */
  questionYesterday: varchar("question_yesterday", { length: 40 }),
  questionToday: varchar("question_today", { length: 40 }),
  questionBlocker: varchar("question_blocker", { length: 40 }),
  /** Titles each new member gets as "Just me" tasks. */
  starterTasks: text("starter_tasks").array().notNull().default([]),
  /** The team's one pinned announcement (`drizzle/0109_project_chat_and_talking.sql`). */
  announcementId: varchar("announcement_id", { length: 36 }),
  announcementText: varchar("announcement_text", { length: 500 }),
  announcementByUserId: varchar("announcement_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  announcementAt: timestamp("announcement_at", { withTimezone: true }),
})

/** Each join through a team's link, for the daily cap. */
export const projectTeamJoins = pgTable(
  "project_team_joins",
  {
    teamId: varchar("team_id", { length: 36 })
      .notNull()
      .references(() => projectTeams.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId, table.joinedAt] })]
)

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
    /** A short job title, such as "Copywriter" (`drizzle/0104_project_running_the_team.sql`). */
    title: varchar("title", { length: 40 }),
    /** The announcement this person hid; a newer one shows again. */
    hiddenAnnouncementId: varchar("hidden_announcement_id", { length: 36 }),
    /** The Team calendar's "Due dates" switch, each person's own (`drizzle/0113_project_nine_features.sql`). */
    calendarDueDates: boolean("calendar_due_dates").notNull().default(false),
    /** My dashboard's Board columns, each person's own order (`drizzle/0116_project_my_status_order.sql`). */
    myStatusOrder: text("my_status_order").array().$type<TaskStatus[]>().notNull().default([]),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId] })]
)

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
  /** The project's own optional due date (`drizzle/0102_project_projects.sql`). */
  dueDate: date("due_date", { mode: "string" }),
  /** Set on one person's own "Just me" project, which only they can open. */
  personalUserId: varchar("personal_user_id", { length: 36 }).references(userRef, {
    onDelete: "cascade",
  }),
  /** Warn when one person has more than this many tasks in Doing; null warns never. */
  doingLimit: smallint("doing_limit"),
  /** The team's task types this project leaves out (`drizzle/0107_project_task_types.sql`). */
  hiddenTypeIds: text("hidden_type_ids").array().notNull().default([]),
  /** The type New task starts on here. */
  defaultTypeId: varchar("default_type_id", { length: 36 }).references(
    (): AnyPgColumn => projectTaskTypes.id,
    { onDelete: "set null" }
  ),
  /** The Board's column order (`drizzle/0115_project_status_order.sql`); empty is the usual one. */
  statusOrder: text("status_order").array().$type<TaskStatus[]>().notNull().default([]),
  /**
   * The project's status, its line of why, and who set it when
   * (`drizzle/0117_project_more_for_projects.sql`). Null is no status.
   */
  health: varchar("health", { length: 16 }).$type<ProjectHealth>(),
  healthNote: varchar("health_note", { length: 200 }),
  healthByUserId: varchar("health_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  healthAt: timestamp("health_at", { withTimezone: true }),
  /** The one member answerable for it, who hears every Stuck, unblocked and Done. */
  leadUserId: varchar("lead_user_id", { length: 36 }).references(userRef, { onDelete: "set null" }),
  /** The client's name, a name and not a record. */
  client: varchar("client", { length: 60 }),
  /** Everyone on the team is a member, people who join later included. */
  wholeTeam: boolean("whole_team").notNull().default(false),
})

/** A project's milestones: when a set of its tasks must be finished. */
export const projectMilestones = pgTable("project_milestones", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 })
    .notNull()
    .references(() => projectProjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dueDate: date("due_date", { mode: "string" }),
  createdAt: createdAt(),
})

/** Moments that belong to a project rather than a task, for its Activity tab. */
export const projectProjectEvents = pgTable("project_project_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 })
    .notNull()
    .references(() => projectProjects.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 16 }).$type<"health_set">().notNull(),
  actorUserId: varchar("actor_user_id", { length: 36 }).references(userRef, { onDelete: "set null" }),
  /** The new status; null when it was taken off. */
  health: varchar("health", { length: 16 }).$type<ProjectHealth>(),
  note: varchar("note", { length: 200 }),
  createdAt: createdAt(),
})

/** A saved project template: a copy of a project's plan, taken when it was saved. */
export const projectTemplates = pgTable("project_templates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 })
    .notNull()
    .references(() => projectTeams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  content: jsonb("content").$type<TemplateContent>().notNull(),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
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
  /** The project's own heading this task sits under (`drizzle/0099_project_finding_and_sorting.sql`). */
  sectionId: varchar("section_id", { length: 36 }).references(() => projectSections.id, {
    onDelete: "set null",
  }),
  /** One order for the whole project, set by dragging. */
  position: integer("position").notNull().default(0),
  /**
   * The moment it is due by, when it has a time as well as a day
   * (`drizzle/0114_project_due_time.sql`). Null is due all day.
   */
  dueAt: timestamp("due_at", { withTimezone: true }),
  /** When it last became Done; cleared when it leaves Done. */
  completedAt: timestamp("completed_at", { withTimezone: true }),
  /** The repeat rule, on the newest copy only (`drizzle/0101_project_planning_ahead.sql`). */
  repeatEvery: varchar("repeat_every", { length: 16 }).$type<RepeatEvery>(),
  repeatWeekDays: smallint("repeat_week_days").array(),
  repeatMonthDay: smallint("repeat_month_day"),
  /**
   * The day an every-2-weeks or every-3-months rule counts from, carried by
   * every copy (`drizzle/0111_project_planning_tasks.sql`).
   */
  repeatFrom: date("repeat_from", { mode: "string" }),
  /** The first task of a repeating series, carried by every copy. */
  repeatSeriesId: varchar("repeat_series_id", { length: 36 }),
  snoozedUntil: date("snoozed_until", { mode: "string" }),
  /** In the bin since then; emptied for good after 30 days. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedByUserId: varchar("deleted_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  /** The hand-over's note, shown beside Waiting (`drizzle/0106_project_checkin_and_handing_out.sql`). */
  handoverNote: text("handover_note"),
  /** Done waits for whoever turned this on to confirm it. A mark on Done, never a fifth status. */
  needsReview: boolean("needs_review").notNull().default(false),
  reviewerUserId: varchar("reviewer_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  reviewWaitingSince: timestamp("review_waiting_since", { withTimezone: true }),
  /**
   * Who first handed it out; null until someone does, which then means whoever
   * made it. It never moves with later hand-overs (`drizzle/0108_project_first_handed_out_by.sql`).
   */
  firstHandedOutByUserId: varchar("first_handed_out_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  /** The kind of task, such as "Video editing"; null is a plain task (`drizzle/0107_project_task_types.sql`). */
  typeId: varchar("type_id", { length: 36 }).references((): AnyPgColumn => projectTaskTypes.id, {
    onDelete: "set null",
  }),
  /** High, Normal or Low (`drizzle/0111_project_planning_tasks.sql`). */
  priority: varchar("priority", { length: 8 }).$type<TaskPriority>().notNull().default("normal"),
  /** An optional first day, drawn with the due date on the Timeline (`drizzle/0113_project_nine_features.sql`). */
  startDate: date("start_date", { mode: "string" }),
  /** The one milestone it counts toward (`drizzle/0117_project_more_for_projects.sql`). */
  milestoneId: varchar("milestone_id", { length: 36 }).references((): AnyPgColumn => projectMilestones.id, {
    onDelete: "set null",
  }),
})

/**
 * What a task waits on, up to 10 tasks (`drizzle/0111_project_planning_tasks.sql`).
 * It replaced the single `waiting_on_task_id` column, which the code no
 * longer reads and a later migration drops.
 */
export const projectTaskWaits = pgTable(
  "project_task_waits",
  {
    taskId: varchar("task_id", { length: 36 })
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    waitingOnTaskId: varchar("waiting_on_task_id", { length: 36 })
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.waitingOnTaskId] })]
)

/** "Remind me": one day per person per task, deleted as its bell notice is sent. */
export const projectTaskReminders = pgTable(
  "project_task_reminders",
  {
    taskId: varchar("task_id", { length: 36 })
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.userId] })]
)

/** The team's saved step lists, such as "Payroll", dropped into any task. */
export const projectStepLists = pgTable("project_step_lists", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 })
    .notNull()
    .references(() => projectTeams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  steps: text("steps").array().notNull(),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
})

/** The team's kinds of task. Archived, never deleted, so their tasks keep them. */
export const projectTaskTypes = pgTable("project_task_types", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 })
    .notNull()
    .references(() => projectTeams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: varchar("icon", { length: 32 }).notNull(),
  color: varchar("color", { length: 16 }).$type<ProjectColor>().notNull(),
  position: integer("position").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  /** The steps and notes New task starts with when the type is picked. */
  steps: text("steps").array().notNull().default([]),
  notes: text("notes").notNull().default(""),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
})

/** One type's fields, such as "Footage link" or "Platform". */
export const projectTaskTypeFields = pgTable("project_task_type_fields", {
  id: varchar("id", { length: 36 }).primaryKey(),
  typeId: varchar("type_id", { length: 36 })
    .notNull()
    .references(() => projectTaskTypes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: varchar("kind", { length: 16 }).$type<FieldKind>().notNull(),
  position: integer("position").notNull(),
  neededBeforeDone: boolean("needed_before_done").notNull().default(false),
  neededWhenMade: boolean("needed_when_made").notNull().default(false),
  whoCanChange: varchar("who_can_change", { length: 16 }).$type<WhoCanChange>().notNull().default("anyone"),
  settings: jsonb("settings").$type<FieldSettings>().notNull().default({}),
  createdAt: createdAt(),
})

/** What a task holds in one field. An empty field has no row. */
export const projectTaskFieldValues = pgTable(
  "project_task_field_values",
  {
    taskId: varchar("task_id", { length: 36 })
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    fieldId: varchar("field_id", { length: 36 })
      .notNull()
      .references(() => projectTaskTypeFields.id, { onDelete: "cascade" }),
    value: jsonb("value").notNull(),
    updatedByUserId: varchar("updated_by_user_id", { length: 36 }).references(userRef, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.fieldId] })]
)

/** One copy of a repeating task per day, claimed before it is made. */
export const projectRepeatRuns = pgTable(
  "project_repeat_runs",
  {
    seriesId: varchar("series_id", { length: 36 }).notNull(),
    day: date("day", { mode: "string" }).notNull(),
    madeAt: timestamp("made_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.seriesId, table.day] })]
)

/** A project's own headings, such as "Design" and "Build". */
export const projectSections = pgTable("project_sections", {
  id: varchar("id", { length: 36 }).primaryKey(),
  projectId: varchar("project_id", { length: 36 })
    .notNull()
    .references(() => projectProjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  createdAt: createdAt(),
})

/** The team's labels, such as "Bug" or "Client", which cut across projects. */
export const projectLabels = pgTable("project_labels", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 })
    .notNull()
    .references(() => projectTeams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: varchar("color", { length: 16 }).$type<ProjectColor>().notNull(),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
})

export const projectTaskLabels = pgTable(
  "project_task_labels",
  {
    taskId: varchar("task_id", { length: 36 })
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    labelId: varchar("label_id", { length: 36 })
      .notNull()
      .references(() => projectLabels.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.labelId] })]
)

/** Each person's own starred projects, which sit first on the Projects page. */
export const projectProjectStars = pgTable(
  "project_project_stars",
  {
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projectProjects.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })]
)

export const projectTaskSteps = pgTable("project_task_steps", {
  id: varchar("id", { length: 36 }).primaryKey(),
  taskId: varchar("task_id", { length: 36 })
    .notNull()
    .references(() => projectTasks.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  done: boolean("done").notNull(),
  position: integer("position").notNull(),
  createdAt: createdAt(),
  /** Someone on the project doing this step (`drizzle/0100_project_making_and_changing.sql`). */
  assigneeUserId: varchar("assignee_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  dueDate: date("due_date", { mode: "string" }),
})

/**
 * A chat message: on a task (`taskId`), or in a project's own chat
 * (`projectId`), never both (`drizzle/0109_project_chat_and_talking.sql`).
 */
export const projectTaskComments = pgTable("project_task_comments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  taskId: varchar("task_id", { length: 36 }).references(() => projectTasks.id, {
    onDelete: "cascade",
  }),
  projectId: varchar("project_id", { length: 36 }).references(() => projectProjects.id, {
    onDelete: "cascade",
  }),
  /** The message this one answers. */
  replyToCommentId: varchar("reply_to_comment_id", { length: 36 }).references(
    (): AnyPgColumn => projectTaskComments.id,
    { onDelete: "set null" }
  ),
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

/** Who reacted to a chat message, and with which of the five reactions. */
export const projectCommentReactions = pgTable(
  "project_comment_reactions",
  {
    commentId: varchar("comment_id", { length: 36 })
      .notNull()
      .references(() => projectTaskComments.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    reaction: varchar("reaction", { length: 16 }).$type<Reaction>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.commentId, table.userId, table.reaction] })]
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

/**
 * A file on a task, or sent in a project's chat (`taskId` null, `commentId`
 * set). `storagePath` is the bucket key and never leaves the server.
 */
export const projectTaskFiles = pgTable("project_task_files", {
  id: varchar("id", { length: 36 }).primaryKey(),
  taskId: varchar("task_id", { length: 36 }).references(() => projectTasks.id, {
    onDelete: "cascade",
  }),
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
  /** Set when the file sits in a File field rather than the task's Files card. */
  fieldId: varchar("field_id", { length: 36 }).references(() => projectTaskTypeFields.id, {
    onDelete: "cascade",
  }),
  /** The chat message it was sent in (`drizzle/0109_project_chat_and_talking.sql`). */
  commentId: varchar("comment_id", { length: 36 }).references(() => projectTaskComments.id, {
    onDelete: "cascade",
  }),
})

/**
 * Each saved state of a task's notes, one per editing session. The newest is
 * the current notes; the 20 before it are "Earlier versions".
 */
export const projectTaskNoteVersions = pgTable("project_task_note_versions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  taskId: varchar("task_id", { length: 36 })
    .notNull()
    .references(() => projectTasks.id, { onDelete: "cascade" }),
  notes: text("notes").notNull(),
  savedByUserId: varchar("saved_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
  /** The editing session that saved it; null for the notes from before versions were kept. */
  sessionId: varchar("session_id", { length: 36 }),
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
  /** The person's own short notes (`drizzle/0105_project_team_dashboard.sql`). */
  noteYesterday: text("note_yesterday"),
  noteToday: text("note_today"),
  noteBlocker: text("note_blocker"),
  /** The optional check-out, private to the person (`drizzle/0106_project_checkin_and_handing_out.sql`). */
  checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
  noteLeft: text("note_left"),
  /** The words the three boxes had that day: Yesterday, Today, Blocker or the team's own. */
  questionLabels: text("question_labels").array(),
  /** The tasks ticked at check-out for the next check-in; null when none were planned. */
  tomorrowTaskIds: text("tomorrow_task_ids").array(),
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
  /** The person's own order for the day's picks. */
  position: integer("position"),
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
 * One "Due tomorrow" and one "Overdue" per task per due date, written before
 * the bell notice (`drizzle/0098_project_reminders.sql`).
 */
export const projectDueReminders = pgTable(
  "project_due_reminders",
  {
    taskId: varchar("task_id", { length: 36 })
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).$type<DueReminderKind>().notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.kind, table.dueDate] })]
)

/** "Milestone due tomorrow", once per person per milestone per date (`drizzle/0118_project_features_16_oct.sql`). */
export const projectMilestoneReminders = pgTable(
  "project_milestone_reminders",
  {
    milestoneId: varchar("milestone_id", { length: 36 })
      .notNull()
      .references(() => projectMilestones.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.milestoneId, table.userId, table.dueDate] })]
)

/** One morning notice per team per day, written before the bell notices. */
export const projectTeamMorningNotices = pgTable(
  "project_team_morning_notices",
  {
    teamId: varchar("team_id", { length: 36 })
      .notNull()
      .references(() => projectTeams.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.day] })]
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
  /** The task a step became, or the one it came from. */
  relatedTaskId: varchar("related_task_id", { length: 36 }).references(() => projectTasks.id, {
    onDelete: "set null",
  }),
})

/** A person's days off, first to last inclusive (`drizzle/0103_project_time_off.sql`). */
export const projectTimeOff = pgTable("project_time_off", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 })
    .notNull()
    .references(() => projectTeams.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(userRef, { onDelete: "cascade" }),
  firstDay: date("first_day", { mode: "string" }).notNull(),
  lastDay: date("last_day", { mode: "string" }).notNull(),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
})

/**
 * A meeting on the Team dashboard's calendar (`drizzle/0105_project_team_dashboard.sql`).
 * `day`, `startTime` and `endTime` are wall-clock in `timeZone`.
 */
export const projectMeetings = pgTable("project_meetings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 })
    .notNull()
    .references(() => projectTeams.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  color: varchar("color", { length: 16 }).$type<ProjectColor>().notNull(),
  day: date("day", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  timeZone: text("time_zone").notNull(),
  repeatEvery: varchar("repeat_every", { length: 16 }).$type<MeetingRepeat>(),
  videoUrl: text("video_url"),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

/** Who is invited to each meeting. */
export const projectMeetingPeople = pgTable(
  "project_meeting_people",
  {
    meetingId: varchar("meeting_id", { length: 36 })
      .notNull()
      .references(() => projectMeetings.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.meetingId, table.userId] })]
)

/** Going or Not going, one per invited person, for every time the meeting repeats. */
export const projectMeetingAnswers = pgTable(
  "project_meeting_answers",
  {
    meetingId: varchar("meeting_id", { length: 36 })
      .notNull()
      .references(() => projectMeetings.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    answer: varchar("answer", { length: 16 }).$type<MeetingAnswer>().notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.meetingId, table.userId] })]
)

/**
 * A meeting's notes for one date it falls on, in the meeting's own calendar
 * (`drizzle/0112_project_meetings_and_notices.sql`).
 */
export const projectMeetingNotes = pgTable(
  "project_meeting_notes",
  {
    meetingId: varchar("meeting_id", { length: 36 })
      .notNull()
      .references(() => projectMeetings.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    notes: text("notes").notNull(),
    updatedByUserId: varchar("updated_by_user_id", { length: 36 }).references(userRef, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.meetingId, table.day] })]
)

/** The bell notices a person has switched off. A kind with no row is on. */
export const projectNoticesOff = pgTable(
  "project_notices_off",
  {
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.kind] })]
)

/** A one-line reply under someone's blocker on the Team dashboard. */
export const projectBlockerReplies = pgTable("project_blocker_replies", {
  id: varchar("id", { length: 36 }).primaryKey(),
  checkinId: varchar("checkin_id", { length: 36 })
    .notNull()
    .references(() => projectCheckins.id, { onDelete: "cascade" }),
  /** The Stuck task replied about; null for a reply to the Blocker note. */
  taskId: varchar("task_id", { length: 36 }).references(() => projectTasks.id, {
    onDelete: "set null",
  }),
  authorUserId: varchar("author_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  body: text("body").notNull(),
  createdAt: createdAt(),
})

/** Who each check-in note tagged, so an edit tells only the newly tagged. */
export const projectCheckinMentions = pgTable(
  "project_checkin_mentions",
  {
    checkinId: varchar("checkin_id", { length: 36 })
      .notNull()
      .references(() => projectCheckins.id, { onDelete: "cascade" }),
    field: varchar("field", { length: 16 }).$type<CheckinNoteField>().notNull(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.checkinId, table.field, table.userId] })]
)

/** A day off for the whole team, such as Christmas Day. */
export const projectTeamHolidays = pgTable("project_team_holidays", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 })
    .notNull()
    .references(() => projectTeams.id, { onDelete: "cascade" }),
  day: date("day", { mode: "string" }).notNull(),
  name: text("name").notNull(),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(userRef, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
})

/** One thanks per person per finished task. */
export const projectTaskThanks = pgTable(
  "project_task_thanks",
  {
    taskId: varchar("task_id", { length: 36 })
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    thankedUserId: varchar("thanked_user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.userId] })]
)

/**
 * A person's own saved filters on one project (`projectId`) or on My tasks
 * (`projectId` null). Nobody else sees them
 * (`drizzle/0110_project_finding_and_seeing.sql`).
 */
export const projectSavedViews = pgTable("project_saved_views", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 })
    .notNull()
    .references(() => projectTeams.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(userRef, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 36 }).references(() => projectProjects.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  /** The address's filters: q, status, person, label, type. */
  filters: jsonb("filters").$type<SavedViewFilters>().notNull(),
  /** The person's and label's names when saved, so a view can say who has left. */
  names: jsonb("names").$type<SavedViewNames>().notNull().default({}),
  createdAt: createdAt(),
})

/**
 * How far each person has read a task's chat (`drizzle/0113_project_nine_features.sql`).
 * Newer messages from someone else are new to them.
 */
export const projectTaskReads = pgTable(
  "project_task_reads",
  {
    taskId: varchar("task_id", { length: 36 })
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.userId] })]
)

/** The same for each project's own chat. */
export const projectChatReads = pgTable(
  "project_chat_reads",
  {
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projectProjects.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })]
)

/** A chat message that is a poll: its words are the question, and these its choices. */
export const projectPolls = pgTable("project_polls", {
  commentId: varchar("comment_id", { length: 36 })
    .primaryKey()
    .references(() => projectTaskComments.id, { onDelete: "cascade" }),
  choices: text("choices").array().notNull(),
})

/** One vote per person per poll, by the choice's place in the list. */
export const projectPollVotes = pgTable(
  "project_poll_votes",
  {
    commentId: varchar("comment_id", { length: 36 })
      .notNull()
      .references(() => projectPolls.commentId, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    choice: smallint("choice").notNull(),
    votedAt: timestamp("voted_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.commentId, table.userId] })]
)

/** Who has seen each team announcement, once each. */
export const projectAnnouncementViews = pgTable(
  "project_announcement_views",
  {
    teamId: varchar("team_id", { length: 36 })
      .notNull()
      .references(() => projectTeams.id, { onDelete: "cascade" }),
    announcementId: varchar("announcement_id", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(userRef, { onDelete: "cascade" }),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.announcementId, table.userId] })]
)

/**
 * The site admin's own row (`drizzle/0119_project_employees_and_site_admin.sql`).
 * `team_id` held the header's team picker, removed on 19 Oct 2026 when each
 * page began naming its team, and is no longer read; the row still holds
 * `calendar_due_dates`. Never renamed or dropped: the column stays as stored.
 */
export const projectSiteAdminTeams = pgTable("project_site_admin_teams", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(userRef, { onDelete: "cascade" }),
  teamId: varchar("team_id", { length: 36 })
    .notNull()
    .references(() => projectTeams.id, { onDelete: "cascade" }),
  /** The Team calendar's "Due dates" switch, which an employee keeps on their team row. */
  calendarDueDates: boolean("calendar_due_dates").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})
