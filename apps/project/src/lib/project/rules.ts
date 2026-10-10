import { z } from "zod"

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

export const LIMITS = {
  teamName: 80,
  projectName: 80,
  projectDescription: 2000,
  taskTitle: 200,
  taskNotes: 10_000,
  stepText: 200,
  stepsPerTask: 50,
  comment: 4000,
  reason: 200,
} as const

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
  name: trimmed(LIMITS.projectName, "The project name").optional(),
  color: projectColorSchema.optional(),
  description: z.string().trim().max(LIMITS.projectDescription).optional(),
})

export const reasonSchema = trimmed(LIMITS.reason, "The reason")

const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date from the calendar.")
  .nullable()

export const createTaskSchema = z.object({
  projectId: id,
  title: trimmed(LIMITS.taskTitle, "The task title"),
  notes: z.string().trim().max(LIMITS.taskNotes).default(""),
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
  notes: z.string().trim().max(LIMITS.taskNotes).optional(),
  dueDate: dueDateSchema.optional(),
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

export const commentSchema = z.object({
  taskId: id,
  body: trimmed(LIMITS.comment, "The comment"),
})
