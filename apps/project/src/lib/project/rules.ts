import { z } from "zod"

import { isRealDay } from "@/lib/project/days"
import { storedTaskNotes } from "@/lib/project/notes"

/**
 * Project's fixed lists and the limits on what people type, shared by the
 * server that checks them and the screens that draw them.
 *
 * Tyler's rules for the product are in `workspace/docs/what-this-app-is.md`,
 * which outranks this file.
 */

export type TeamRole = "owner" | "admin" | "member"

/** An invite never makes an owner; ownership is handed over, not given out. */
export const TEAM_INVITE_ROLES = ["admin", "member"] as const
export type TeamInviteRole = (typeof TEAM_INVITE_ROLES)[number]

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

/** The owner and admins run the team: people, invites and its settings. */
export function runsTheTeam(role: TeamRole | null | undefined) {
  return role === "owner" || role === "admin"
}

/**
 * Four statuses, in board order. Tyler chose status plus optional steps over a
 * percentage, because "60% done" is a guess and "3 of 5 steps done" is a count.
 */
export const TASK_STATUSES = ["todo", "doing", "done", "stuck"] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
  stuck: "Stuck",
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return (TASK_STATUSES as readonly unknown[]).includes(value)
}

/**
 * A project's colour is a label people pick, like a folder's, so it keeps its
 * own hue in both themes rather than following a theme token.
 */
export const PROJECT_COLORS = [
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const
export type ProjectColor = (typeof PROJECT_COLORS)[number]

export const PROJECT_COLOR_LABEL: Record<ProjectColor, string> = {
  slate: "Grey",
  red: "Red",
  orange: "Orange",
  amber: "Yellow",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  violet: "Purple",
  pink: "Pink",
}

/** The dot drawn beside a project's name. Written out so Tailwind finds them. */
export const PROJECT_COLOR_DOT: Record<ProjectColor, string> = {
  slate: "bg-slate-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  green: "bg-green-600",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
}

export const DEFAULT_CHECKIN_TIME = "09:00"
/** Monday to Friday, 0 = Sunday … 6 = Saturday, the way `Date#getDay` counts. */
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5] as const
export const WEEK_DAYS = [
  { day: 1, short: "Mon" },
  { day: 2, short: "Tue" },
  { day: 3, short: "Wed" },
  { day: 4, short: "Thu" },
  { day: 5, short: "Fri" },
  { day: 6, short: "Sat" },
  { day: 0, short: "Sun" },
] as const

/** How long an invite link works. */
export const INVITE_LIFETIME_DAYS = 7

/** What a check-in holds: a task worked on that day, or one let go from the last check-in. */
export type CheckinItemKind = "pick" | "drop"

/** A due date coming up, or one that has passed. */
export type DueReminderKind = "due_soon" | "overdue"

/** More due reminders than this for one person at once become one notice. */
export const DUE_REMINDERS_BEFORE_GROUPING = 3

/** The team's morning notice waits this long after the latest check-in time. */
export const MORNING_NOTICE_DELAY_MINUTES = 30

/**
 * The moments of a task's life its history shows beside the days it was
 * picked. Saved kinds are never renamed; new ones are added.
 */
export type TaskEventKind =
  | "handed_over"
  | "accepted"
  | "handed_back"
  /** On the task a step came from: the step became its own task. */
  | "became_task"
  /** On the new task: it was a step in another task. */
  | "from_step"
  /** Moved here from another project; the reason holds that project's name. */
  | "moved"
  /** Put in the bin, and brought back out of it. */
  | "deleted"
  | "restored"
  /** For the project's Activity tab, from 11 Oct 2026; the reason holds the new status. */
  | "created"
  | "status_changed"
  | "commented"

/**
 * A task picked on this many days and still not Done gets a mark saying so,
 * because a task that drags should show up without anyone writing a report.
 */
export const PICKED_MANY_DAYS = 3

export const LIMITS = {
  teamName: 80,
  projectName: 80,
  projectDescription: 2000,
  taskTitle: 200,
  /** The notes as saved: the editor's document, which is longer than its words. */
  taskNotes: 50_000,
  stepText: 200,
  stepsPerTask: 50,
  comment: 4000,
  reason: 200,
  /** Tasks one check-in can pick. A small team's day is never near this. */
  picksPerDay: 100,
  /** Tyler chose these on 10 Oct 2026; Project will be a paid product. */
  filesPerTask: 10,
  fileBytes: 10 * 1024 * 1024,
  teamFileBytes: 5 * 1024 * 1024 * 1024,
  labelName: 40,
  labelsPerTeam: 100,
  sectionName: 60,
  sectionsPerProject: 30,
  /** Tasks one pasted list can make. */
  tasksPerPaste: 50,
  memberTitle: 40,
  meetingTitle: 80,
  /** Everyone on a small team, with room to spare. */
  meetingPeople: 50,
  meetingsPerTeam: 200,
  videoUrl: 2048,
  /** One check-in note: a line, not a report. */
  checkinNote: 280,
} as const

/** People who can join through one team link in a day, so a leaked link can't fill the team. */
export const JOINS_PER_LINK_PER_DAY = 20

/** How a task repeats: every team work day, on chosen week days, or on a date each month. */
export const REPEAT_EVERY = ["workday", "week", "month"] as const
export type RepeatEvery = (typeof REPEAT_EVERY)[number]

/** How a meeting repeats, on the same weekday as its first day. Null is a one-off. */
export const MEETING_REPEATS = ["week", "two_weeks"] as const
export type MeetingRepeat = (typeof MEETING_REPEATS)[number]

/** A deleted task waits in its project's bin this long before it is gone for good. */
export const BIN_DAYS = 30

/** What "Just me" tasks sit under, as a project name nobody else ever sees. */
export const PERSONAL_PROJECT_NAME = "Just me"
/** How a screen names a person's "Just me" project before it exists. */
export const PERSONAL_PROJECT_ID = "personal"

/** The Board's Done column shows tasks finished in this many days; older ones wait behind "Show older". */
export const DONE_RECENT_DAYS = 14

const id = z.string().min(1).max(36)
const trimmed = (max: number, what: string) =>
  z
    .string()
    .trim()
    .min(1, `${what} can't be empty.`)
    .max(max, `${what} can be at most ${max} characters.`)

const teamNameSchema = trimmed(LIMITS.teamName, "The team name")

const checkinTimeSchema = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Pick a time like 09:00.")

const timeZoneSchema = z
  .string()
  .max(64)
  .refine(isKnownTimeZone, "Pick a time zone from the list.")

const workDaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, "Pick at least one work day.")
  .max(7)
  .transform((days) => [...new Set(days)].sort())

function isKnownTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

export const createTeamSchema = z.object({
  name: teamNameSchema,
  timeZone: timeZoneSchema,
})

/** A person's own check-in time and zone. Null goes back to the team's. */
export const myCheckinTimeSchema = z.object({
  checkinTime: checkinTimeSchema.nullable().optional(),
  timeZone: timeZoneSchema.nullable().optional(),
})

export const updateTeamSchema = z.object({
  name: teamNameSchema.optional(),
  checkinTime: checkinTimeSchema.optional(),
  timeZone: timeZoneSchema.optional(),
  workDays: workDaysSchema.optional(),
})

export const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("That doesn't look like an email address.")
    .max(254),
  role: z.enum(TEAM_INVITE_ROLES),
})

const projectColorSchema = z.enum(PROJECT_COLORS)

export const createProjectSchema = z.object({
  name: trimmed(LIMITS.projectName, "The project name"),
  color: projectColorSchema,
  description: z.string().trim().max(LIMITS.projectDescription).default(""),
})

export const updateProjectSchema = z.object({
  projectId: id,
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date from the calendar.")
    .nullable()
    .optional(),
  name: trimmed(LIMITS.projectName, "The project name").optional(),
  color: projectColorSchema.optional(),
  description: z.string().trim().max(LIMITS.projectDescription).optional(),
})

export const reasonSchema = trimmed(LIMITS.reason, "The reason")

/** The editor's document, cleaned to what notes may hold and saved as text. */
const notesSchema = z
  .unknown()
  .transform(storedTaskNotes)
  .refine((notes) => notes.length <= LIMITS.taskNotes, "The notes are too long. Split them up or attach a file.")

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date from the calendar.")

export const timeOffSchema = z.object({
  userId: id.optional(),
  firstDay: dayKey,
  lastDay: dayKey,
})

export const memberTitleSchema = z.object({
  userId: id.optional(),
  title: z.string().trim().max(LIMITS.memberTitle, "A job title can be at most 40 characters.").nullable(),
})

export const handOverAllSchema = z.object({ fromUserId: id, toUserId: id })

export const copyProjectSchema = z.object({
  projectId: id,
  name: trimmed(LIMITS.projectName, "The project name"),
})

const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date from the calendar.")
  .nullable()

export const createTaskSchema = z.object({
  projectId: id,
  title: trimmed(LIMITS.taskTitle, "The task title"),
  notes: notesSchema.default(""),
  assigneeUserId: id.nullable(),
  dueDate: dueDateSchema.default(null),
  steps: z
    .array(trimmed(LIMITS.stepText, "A step"))
    .max(LIMITS.stepsPerTask)
    .default([]),
})

export const updateTaskSchema = z.object({
  taskId: id,
  title: trimmed(LIMITS.taskTitle, "The task title").optional(),
  notes: notesSchema.optional(),
  dueDate: dueDateSchema.optional(),
  sectionId: id.nullable().optional(),
  snoozedUntil: dueDateSchema.optional(),
})

export const setRepeatSchema = z.object({
  taskId: id,
  repeat: z
    .discriminatedUnion("every", [
      z.object({ every: z.literal("workday") }),
      z.object({
        every: z.literal("week"),
        weekDays: z
          .array(z.number().int().min(0).max(6))
          .min(1, "Pick at least one day of the week.")
          .max(7)
          .transform((days) => [...new Set(days)].sort()),
      }),
      z.object({ every: z.literal("month"), monthDay: z.number().int().min(1).max(31) }),
    ])
    .nullable(),
})

export const setWaitingOnSchema = z.object({
  taskId: id,
  waitingOnTaskId: id.nullable(),
})

export const createTasksFromLinesSchema = z.object({
  projectId: id,
  titles: z.array(trimmed(LIMITS.taskTitle, "The task title")).min(1).max(LIMITS.tasksPerPaste),
  assigneeUserId: id.nullable(),
  dueDate: dueDateSchema.default(null),
})

export const updateStepSchema = z.object({
  stepId: id,
  text: trimmed(LIMITS.stepText, "A step").optional(),
  done: z.boolean().optional(),
  assigneeUserId: id.nullable().optional(),
  dueDate: dueDateSchema.optional(),
})

export const bulkChangeSchema = z.object({
  taskIds: z.array(id).min(1).max(200),
  change: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("status"),
      status: z.enum(TASK_STATUSES),
      stuckReason: reasonSchema.nullable().default(null),
    }),
    z.object({ kind: z.literal("assign"), assigneeUserId: id.nullable() }),
    z.object({ kind: z.literal("due"), dueDate: dueDateSchema }),
    z.object({ kind: z.literal("move"), projectId: id }),
  ]),
})

export const labelSchema = z.object({
  name: trimmed(LIMITS.labelName, "The label name"),
  color: projectColorSchema,
})

export const updateLabelSchema = labelSchema.partial().extend({ labelId: id })

export const setTaskLabelsSchema = z.object({
  taskId: id,
  labelIds: z.array(id).max(LIMITS.labelsPerTeam),
})

export const sectionNameSchema = trimmed(LIMITS.sectionName, "The section name")

export const reorderTasksSchema = z.object({
  projectId: id,
  /** The tasks being arranged, in their new order. */
  taskIds: z.array(id).min(1).max(1000),
})

export const setTaskStatusSchema = z.object({
  taskId: id,
  status: z.enum(TASK_STATUSES),
  stuckReason: reasonSchema.nullable().default(null),
})

export const assignTaskSchema = z.object({
  taskId: id,
  assigneeUserId: id.nullable(),
})

const messageSchema = trimmed(LIMITS.comment, "The message")

export const commentSchema = z.object({
  taskId: id,
  body: messageSchema,
})

export const editCommentSchema = z.object({
  commentId: id,
  body: messageSchema,
})

/** A check-in's three notes. An empty box saves as no note. */
const noteSchema = z
  .string()
  .trim()
  .max(LIMITS.checkinNote, `A note can be at most ${LIMITS.checkinNote} characters.`)
  .transform((value) => value || null)

export const checkinNotesSchema = z.object({
  yesterday: noteSchema,
  today: noteSchema,
  blocker: noteSchema,
})
export type CheckinNotes = { yesterday: string | null; today: string | null; blocker: string | null }

/**
 * A check-in: an answer for each task left over from the last check-in, and
 * the tasks picked for today.
 */
export const submitCheckinSchema = z.object({
  answers: z
    .array(
      z.discriminatedUnion("action", [
        z.object({ taskId: id, action: z.literal("carry") }),
        z.object({ taskId: id, action: z.literal("drop"), reason: reasonSchema }),
      ])
    )
    .max(LIMITS.picksPerDay),
  picks: z.array(id).max(LIMITS.picksPerDay),
  notes: checkinNotesSchema.optional(),
})

/** "HH:MM" on a meeting, 24-hour, as the time field gives it. */
const meetingTimeSchema = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Pick a time like 10:00.")

/** Any https address. The row names the service when it knows it. */
const videoUrlSchema = z
  .string()
  .trim()
  .max(LIMITS.videoUrl, "That link is too long.")
  .refine((value) => value === "" || isHttpsUrl(value), "The video link must start with https://.")
  .transform((value) => value || null)

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

export const meetingSchema = z
  .object({
    title: trimmed(LIMITS.meetingTitle, "The meeting name"),
    color: z.enum(PROJECT_COLORS),
    day: z.string().refine(isRealDay, "Pick the meeting's day."),
    startTime: meetingTimeSchema,
    endTime: meetingTimeSchema,
    repeatEvery: z.enum(MEETING_REPEATS).nullable(),
    videoUrl: videoUrlSchema,
    peopleIds: z
      .array(id)
      .max(LIMITS.meetingPeople, `A meeting can have at most ${LIMITS.meetingPeople} people.`)
      .transform((ids) => [...new Set(ids)]),
  })
  .refine((meeting) => meeting.endTime > meeting.startTime, {
    message: "The meeting has to end after it starts.",
    path: ["endTime"],
  })

export const updateMeetingSchema = z.object({ meetingId: id, meeting: meetingSchema })

/** The team photo's address from the media library, or "" to take it away. */
export const teamPhotoSchema = z.object({ photoUrl: z.string().trim().max(2048) })
