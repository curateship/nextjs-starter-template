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
 * What to pick first at check-in. Every task starts Normal. Low is drawn
 * faintly so people use it, because when everything is High nothing is.
 */
export const TASK_PRIORITIES = ["high", "normal", "low"] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "High",
  normal: "Normal",
  low: "Low",
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return (TASK_PRIORITIES as readonly unknown[]).includes(value)
}

/** High first, then Normal, then Low. */
export function priorityRank(priority: TaskPriority) {
  return TASK_PRIORITIES.indexOf(priority)
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

/** The check-in's three note boxes, as saved. Their words on screen can be the team's own. */
export const CHECKIN_NOTE_FIELDS = ["yesterday", "today", "blocker"] as const
export type CheckinNoteField = (typeof CHECKIN_NOTE_FIELDS)[number]

/** The words a team's three boxes have until the owner renames them. */
export const DEFAULT_CHECKIN_QUESTIONS: Record<CheckinNoteField, string> = {
  yesterday: "Yesterday",
  today: "Today",
  blocker: "Blocker",
}
export type CheckinQuestions = Record<CheckinNoteField, string>

/** A team's own words, with the usual one wherever a box keeps its name. */
export function checkinQuestions(own: {
  yesterday: string | null
  today: string | null
  blocker: string | null
}): CheckinQuestions {
  return {
    yesterday: own.yesterday || DEFAULT_CHECKIN_QUESTIONS.yesterday,
    today: own.today || DEFAULT_CHECKIN_QUESTIONS.today,
    blocker: own.blocker || DEFAULT_CHECKIN_QUESTIONS.blocker,
  }
}

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
  /** A Done task's reviewer confirmed it, or sent it back to Doing with the reason. */
  | "review_confirmed"
  | "sent_back"
  /** The due date moved from one day to another; the reason holds both, "2026-11-03 2026-11-10". */
  | "due_moved"

/**
 * A task picked on this many days and still not Done gets a mark saying so,
 * because a task that drags should show up without anyone writing a report.
 */
export const PICKED_MANY_DAYS = 3

/**
 * A task not Done whose due date has moved this many times gets "Date moved
 * 3 times" beside its date, the same way "Picked on 4 days" works for picks.
 * Setting a first date or clearing one isn't a move.
 */
export const DUE_MOVED_MANY = 3

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
  /** A reply under a blocker: one line, so it never grows into a second chat. */
  blockerReply: 280,
  handoverNote: 200,
  /** The team's own word for a check-in box, such as "Wins". */
  checkinQuestion: 30,
  holidayName: 60,
  holidaysPerTeam: 100,
  starterTasks: 10,
  /** The biggest "Doing per person" a project can set. */
  doingLimit: 99,
  /** Task types: Tyler's task file, 11 Oct 2026. Archived types count too. */
  typesPerTeam: 50,
  typeName: 40,
  fieldsPerType: 30,
  fieldName: 40,
  choicesPerField: 50,
  choiceName: 60,
  fieldText: 500,
  fieldLongText: 5000,
  fieldLink: 2048,
  /** Field columns a project's List can add when filtered to one type. */
  fieldColumns: 3,
  /** Files sent with one chat message, so one send stays one upload of at most 50 MB. */
  filesPerMessage: 5,
  /** The team's pinned announcement: one message, never a chat. */
  announcement: 500,
  /** A poll in a project's chat: its question, and 2 to 6 short choices. */
  pollQuestion: 200,
  pollChoice: 80,
  pollChoicesMin: 2,
  pollChoicesMax: 6,
  /** Earlier versions of a task's notes kept behind the current one. */
  noteVersions: 20,
  /** Project chat messages loaded at a time; older ones wait behind "Show earlier messages". */
  chatPage: 50,
  /** The most a refresh reloads at once: ten pages. */
  chatMostShown: 500,
  /** A saved view's name, and how many one person keeps on one project or on My tasks. */
  viewName: 60,
  viewsPerPlace: 30,
  /** Matches the header's search lists at once. */
  searchResults: 20,
  /** Tasks one task can wait on. */
  waitsPerTask: 10,
  stepListName: 60,
  stepListsPerTeam: 100,
} as const

/** The five fixed reactions under a chat message, in the order they are offered. */
export const REACTIONS = ["thumbs_up", "tick", "eyes", "heart", "laugh"] as const
export type Reaction = (typeof REACTIONS)[number]

export const REACTION_LOOK: Record<Reaction, { emoji: string; label: string }> = {
  thumbs_up: { emoji: "\u{1F44D}", label: "Thumbs up" },
  tick: { emoji: "\u2705", label: "Tick" },
  eyes: { emoji: "\u{1F440}", label: "Eyes" },
  heart: { emoji: "\u2764\uFE0F", label: "Heart" },
  laugh: { emoji: "\u{1F602}", label: "Laugh" },
}

/** How far back My week steps. */
export const MY_WEEK_BACK = 12

/** Replies under blockers one person can write in an hour, so nobody can flood the bell. */
export const BLOCKER_REPLIES_PER_HOUR = 60

/** People who can join through one team link in a day, so a leaked link can't fill the team. */
export const JOINS_PER_LINK_PER_DAY = 20

/**
 * How a task repeats: every team work day, on chosen week days, on a date
 * each month, on chosen days every other week, every 3 months from a first
 * date, or on the team's last work day of each month. Saved values are never
 * renamed; new ones are added.
 */
export const REPEAT_EVERY = ["workday", "week", "month", "two_weeks", "quarter", "last_workday"] as const
export type RepeatEvery = (typeof REPEAT_EVERY)[number]

/** How a meeting repeats, on the same weekday as its first day. Null is a one-off. */
export const MEETING_REPEATS = ["week", "two_weeks"] as const
export type MeetingRepeat = (typeof MEETING_REPEATS)[number]

/** An invited person's answer to a meeting. It holds for every time the meeting repeats. */
export const MEETING_ANSWERS = ["going", "not_going"] as const
export type MeetingAnswer = (typeof MEETING_ANSWERS)[number]

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

const questionSchema = z
  .string()
  .trim()
  .max(LIMITS.checkinQuestion, `A box's name can be at most ${LIMITS.checkinQuestion} characters.`)
  .transform((value) => value || null)
  .nullable()

export const updateTeamSchema = z.object({
  name: teamNameSchema.optional(),
  checkinTime: checkinTimeSchema.optional(),
  timeZone: timeZoneSchema.optional(),
  workDays: workDaysSchema.optional(),
  questionYesterday: questionSchema.optional(),
  questionToday: questionSchema.optional(),
  questionBlocker: questionSchema.optional(),
  starterTasks: z
    .array(trimmed(LIMITS.taskTitle, "A starter task"))
    .max(LIMITS.starterTasks, `A team can have at most ${LIMITS.starterTasks} starter tasks.`)
    .optional(),
})

export const holidaySchema = z.object({
  day: z.string().refine(isRealDay, "Pick the holiday's day."),
  name: trimmed(LIMITS.holidayName, "The holiday's name"),
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

/** How many addresses one send of the invite window takes (Tyler, 13 Oct 2026). */
export const INVITE_BATCH = 20

/**
 * Several addresses at once. Each is checked on its own on the server, so one
 * bad address is reported instead of stopping the rest.
 */
export const inviteManySchema = z.object({
  emails: z
    .array(z.string().trim().toLowerCase().max(254))
    .min(1)
    .max(INVITE_BATCH, `One send takes at most ${INVITE_BATCH} addresses.`),
  role: z.enum(TEAM_INVITE_ROLES),
})

/**
 * The addresses in pasted text, split on new lines, commas, semicolons and
 * spaces, lower-cased, with repeats dropped. "Ann <ann@x.com>" gives ann@x.com.
 */
export function inviteAddresses(text: string) {
  const words = text
    .split(/[\s,;]+/)
    .map((word) => word.replace(/^<|>$/g, "").trim().toLowerCase())
    .filter(Boolean)
  return [...new Set(words)]
}

const projectColorSchema = z.enum(PROJECT_COLORS)

export const createProjectSchema = z.object({
  name: trimmed(LIMITS.projectName, "The project name"),
  color: projectColorSchema,
  description: z.string().trim().max(LIMITS.projectDescription).default(""),
})

export const updateProjectSchema = z.object({
  projectId: id,
  doingLimit: z
    .number()
    .int("Type a whole number.")
    .min(1, "The limit has to be at least 1.")
    .max(LIMITS.doingLimit, `The limit can be at most ${LIMITS.doingLimit}.`)
    .nullable()
    .optional(),
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

/** The optional line that goes with a hand-over. Empty is no note. */
const handoverNoteSchema = z
  .string()
  .trim()
  .max(LIMITS.handoverNote, `A note can be at most ${LIMITS.handoverNote} characters.`)
  .transform((value) => value || null)
  .nullable()
  .default(null)

export const handOverAllSchema = z.object({ fromUserId: id, toUserId: id, note: handoverNoteSchema })

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
  handoverNote: handoverNoteSchema,
})

export const updateTaskSchema = z.object({
  taskId: id,
  title: trimmed(LIMITS.taskTitle, "The task title").optional(),
  notes: notesSchema.optional(),
  /** One editing session of the notes, so it keeps one earlier version however often it saves. */
  notesSession: z.string().uuid().optional(),
  dueDate: dueDateSchema.optional(),
  /**
   * The moment it is due by, from the task's "Due by" time. Null clears the
   * time. Changing the due date without one clears it too.
   */
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  /** The first day, drawn with the due date on the Timeline. Never after the due date. */
  startDate: dueDateSchema.optional(),
  sectionId: id.nullable().optional(),
  snoozedUntil: dueDateSchema.optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
})

const weekDaysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, "Pick at least one day of the week.")
  .max(7)
  .transform((days) => [...new Set(days)].sort())

export const setRepeatSchema = z.object({
  taskId: id,
  repeat: z
    .discriminatedUnion("every", [
      z.object({ every: z.literal("workday") }),
      z.object({ every: z.literal("week"), weekDays: weekDaysSchema }),
      z.object({ every: z.literal("month"), monthDay: z.number().int().min(1).max(31) }),
      z.object({ every: z.literal("two_weeks"), weekDays: weekDaysSchema }),
      z.object({ every: z.literal("quarter"), from: z.string().refine(isRealDay, "Pick the first date.") }),
      z.object({ every: z.literal("last_workday") }),
    ])
    .nullable(),
})

/** Adding or taking off one task this one waits on. */
export const waitSchema = z.object({ taskId: id, waitingOnTaskId: id })

/** "Remind me" on a day, or null to take the reminder off. */
export const reminderSchema = z.object({ taskId: id, day: dueDateSchema })

export const stepListNameSchema = trimmed(LIMITS.stepListName, "The list's name")

export const createTasksFromLinesSchema = z.object({
  projectId: id,
  titles: z.array(trimmed(LIMITS.taskTitle, "The task title")).min(1).max(LIMITS.tasksPerPaste),
  assigneeUserId: id.nullable(),
  dueDate: dueDateSchema.default(null),
  handoverNote: handoverNoteSchema,
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
    z.object({ kind: z.literal("assign"), assigneeUserId: id.nullable(), note: handoverNoteSchema }),
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
  note: handoverNoteSchema,
})

/** Accepting every task waiting for me, each on its own. */
export const acceptManySchema = z.object({ taskIds: z.array(id).min(1).max(200) })

export const needsReviewSchema = z.object({ taskId: id, on: z.boolean() })

export const reviewSchema = z.discriminatedUnion("action", [
  z.object({ taskId: id, action: z.literal("confirm") }),
  z.object({ taskId: id, action: z.literal("send_back"), reason: reasonSchema }),
])

/** A message's words. Empty is allowed when the message carries files; the server checks. */
const messageSchema = z
  .string()
  .trim()
  .max(LIMITS.comment, `A message can be at most ${LIMITS.comment} characters.`)

/** Which chat a message goes in: a task's, or a project's own. */
export const chatSchema = z.union([
  z.object({ taskId: id }).strict(),
  z.object({ projectId: id }).strict(),
])
export type ChatPlace = z.infer<typeof chatSchema>

/** A new message, without its files, which travel beside it in the same form. */
export const sendMessageSchema = z.object({
  chat: chatSchema,
  body: messageSchema,
  replyToId: id.nullable(),
})

/**
 * A poll, sent in a project's own chat only: a task's chat can sit inside a
 * window, and a window never opens on top of another.
 */
export const pollSchema = z.object({
  projectId: id,
  question: trimmed(LIMITS.pollQuestion, "The question"),
  choices: z
    .array(trimmed(LIMITS.pollChoice, "A choice"))
    .min(LIMITS.pollChoicesMin, `A poll needs at least ${LIMITS.pollChoicesMin} choices.`)
    .max(LIMITS.pollChoicesMax, `A poll can have at most ${LIMITS.pollChoicesMax} choices.`)
    .refine(
      (choices) => new Set(choices.map((choice) => choice.toLowerCase())).size === choices.length,
      "Each choice has to be different."
    ),
})

/** My vote on a poll: a choice by its place in the list, or null to take it back. */
export const voteSchema = z.object({
  commentId: id,
  choice: z.number().int().min(0).max(LIMITS.pollChoicesMax - 1).nullable(),
})

export const editCommentSchema = z.object({
  commentId: id,
  body: messageSchema,
})

export const deleteCommentSchema = z.object({
  commentId: id,
  /** Its files stay under "Message deleted", and on the task, rather than going with it. */
  keepFiles: z.boolean(),
})

export const reactSchema = z.object({
  commentId: id,
  reaction: z.enum(REACTIONS),
  on: z.boolean(),
})

export const announcementSchema = z.object({
  text: trimmed(LIMITS.announcement, "The announcement"),
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

/**
 * Notes saved during the day. `notify` is set once a box is left, so a name
 * half typed while the notes save themselves never tells the wrong person.
 */
export const saveCheckinNotesSchema = checkinNotesSchema.extend({ notify: z.boolean().default(false) })

export const blockerReplySchema = z.object({
  checkinId: id,
  /** The Stuck task replied about; null for the Blocker note. */
  taskId: id.nullable(),
  body: trimmed(LIMITS.blockerReply, "The reply"),
})

/** The optional evening check-out: the picks now Done, and what's left. */
export const checkOutSchema = z.object({
  doneTaskIds: z.array(id).max(LIMITS.picksPerDay),
  noteLeft: noteSchema,
  /** My open tasks ticked for the next check-in, which opens with them already picked. */
  tomorrowTaskIds: z.array(id).max(LIMITS.picksPerDay),
})

/** Today's picks in my own order. */
export const orderPicksSchema = z.object({ taskIds: z.array(id).min(1).max(LIMITS.picksPerDay) })
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

export const meetingAnswerSchema = z.object({ meetingId: id, answer: z.enum(MEETING_ANSWERS) })

/** One date a meeting falls on, in the meeting's own calendar. */
export const meetingDaySchema = z.object({ meetingId: id, day: z.string().refine(isRealDay, "Pick the meeting's day.") })

export const meetingNotesSchema = meetingDaySchema.extend({ notes: notesSchema })

/** A line of a date's notes, where it sits and its words, and the task made from it. */
export const meetingNoteLineSchema = meetingDaySchema.extend({
  path: z.array(z.number().int().min(0).max(10_000)).min(1).max(3),
  text: z.string().max(LIMITS.taskNotes),
  taskId: id,
})

/** The team photo's address from the media library, or "" to take it away. */
export const teamPhotoSchema = z.object({ photoUrl: z.string().trim().max(2048) })
