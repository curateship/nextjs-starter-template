import {
  AlarmClockIcon,
  AtSignIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ClipboardListIcon,
  ListChecksIcon,
  MessageSquareIcon,
  PlayIcon,
  UndoIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import type { AppNoticeDetail, NoticeToLink } from "@/lib/app-options"

/**
 * Project's bell notices: what each one says and how it looks.
 *
 * The heading is written here and read back here, so the bell can draw a row
 * from the words it already holds without asking the server first.
 */

const TASK_NOTICE_KINDS = [
  "task_assigned",
  "task_handed_back",
  "task_stuck",
  "task_done",
  "task_comment",
  "task_mention",
  "task_unblocked",
  "task_step",
  "task_ready",
  "tasks_handed",
] as const
export type TaskNoticeKind = (typeof TASK_NOTICE_KINDS)[number]

/** Notices the app sends, with no person as the actor. */
const APP_NOTICE_KINDS = [
  "checkin_reminder",
  "due_soon",
  "overdue",
  "team_morning",
  "team_joined",
] as const

const PROJECT_NOTICE_KINDS = [...TASK_NOTICE_KINDS, ...APP_NOTICE_KINDS] as const
export type ProjectNoticeKind = (typeof PROJECT_NOTICE_KINDS)[number]

/** The check-in reminder has no actor, so its heading is the whole sentence. */
export const CHECKIN_REMINDER_HEADING = "Time to check in"
export const CHECKIN_REMINDER_DETAIL = "Pick the tasks you'll work on today."
/** My dashboard with the check-in window open. */
export const CHECKIN_HREF = "/dashboard?checkin=true"

const HEADING_ENDING: Record<Exclude<TaskNoticeKind, "tasks_handed">, string> = {
  task_assigned: " gave you a task",
  task_handed_back: " handed a task back to you",
  task_stuck: " marked a task Stuck",
  task_done: " marked a task Done",
  task_comment: " commented on a task",
  task_mention: " asked you about a task",
  task_unblocked: " unblocked a task",
  task_step: " gave you a step",
  task_ready: " finished what your task was waiting on",
}

/** "Anna gave you a task", or "Anna gave you 9 tasks" for a hand-over of many. */
export function noticeHeading(kind: TaskNoticeKind, actorName: string, count = 1) {
  if (kind === "tasks_handed") return `${actorName} gave you ${count} tasks`
  return `${actorName}${HEADING_ENDING[kind]}`
}

/** "Leo joined the team through the link". */
export function teamJoinedHeading(name: string) {
  return `${name}${TEAM_JOINED_ENDING}`
}

const TEAM_JOINED_ENDING = " joined the team through the link"
const TASKS_HANDED_WORDS = / gave you \d+ tasks$/

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

/**
 * "Due tomorrow", or "Due Monday" when the next work day is further off, and
 * "4 tasks due tomorrow" when several come at once.
 */
export function dueSoonHeading(daysAway: number, weekday: number, count = 1) {
  const when = daysAway === 1 ? "tomorrow" : WEEKDAY_NAMES[weekday]
  return count > 1 ? `${count} tasks due ${when}` : `Due ${when}`
}

export function overdueHeading(count = 1) {
  return count > 1 ? `${count} tasks overdue` : "Overdue"
}

/** "5 of 6 checked in, 1 blocked". */
export function teamMorningHeading(checkedIn: number, expected: number, blocked: number) {
  return `${checkedIn} of ${expected} checked in, ${blocked} blocked`
}

const DUE_SOON_WORDS = new RegExp(`^(\\d+ tasks due|Due) (tomorrow|${WEEKDAY_NAMES.join("|")})$`)
const OVERDUE_WORDS = /^(Overdue|\d+ tasks overdue)$/
const TEAM_MORNING_WORDS = /^\d+ of \d+ checked in, \d+ blocked$/

export function noticeKindFromWords(
  notice: Pick<NoticeToLink, "type" | "message">
): ProjectNoticeKind | null {
  if (notice.type !== "app_activity" || !notice.message) return null
  if (notice.message === CHECKIN_REMINDER_HEADING) return "checkin_reminder"
  if (DUE_SOON_WORDS.test(notice.message)) return "due_soon"
  if (OVERDUE_WORDS.test(notice.message)) return "overdue"
  if (TEAM_MORNING_WORDS.test(notice.message)) return "team_morning"
  if (notice.message.endsWith(TEAM_JOINED_ENDING)) return "team_joined"
  if (TASKS_HANDED_WORDS.test(notice.message)) return "tasks_handed"
  return (
    (Object.keys(HEADING_ENDING) as (keyof typeof HEADING_ENDING)[]).find((kind) =>
      notice.message?.endsWith(HEADING_ENDING[kind])
    ) ?? null
  )
}

export function isProjectNoticeKind(value: unknown): value is ProjectNoticeKind {
  return (PROJECT_NOTICE_KINDS as readonly unknown[]).includes(value)
}

/** One tab in the tray for every Project notice. */
export const PROJECT_NOTICE_CATEGORIES = [{ id: "tasks", label: "Tasks" }] as const

const LOOK: Record<ProjectNoticeKind, AppNoticeDetail> = {
  task_assigned: {
    icon: ClipboardListIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
  },
  task_handed_back: {
    icon: UndoIcon,
    toneClassName: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    categoryId: "tasks",
  },
  task_stuck: {
    icon: CircleAlertIcon,
    toneClassName: "bg-destructive/10 text-destructive",
    categoryId: "tasks",
  },
  task_done: {
    icon: CircleCheckIcon,
    toneClassName: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    categoryId: "tasks",
  },
  task_comment: {
    icon: MessageSquareIcon,
    toneClassName: "bg-secondary text-secondary-foreground",
    categoryId: "tasks",
  },
  task_mention: {
    icon: AtSignIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
  },
  tasks_handed: {
    icon: ClipboardListIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
    href: "/dashboard",
  },
  team_joined: {
    icon: UserPlusIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
    href: "/team/members",
  },
  task_ready: {
    icon: PlayIcon,
    toneClassName: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    categoryId: "tasks",
  },
  task_step: {
    icon: ListChecksIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
  },
  task_unblocked: {
    icon: PlayIcon,
    toneClassName: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    categoryId: "tasks",
  },
  checkin_reminder: {
    icon: CalendarCheckIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
    href: CHECKIN_HREF,
  },
  due_soon: {
    icon: CalendarClockIcon,
    toneClassName: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    categoryId: "tasks",
  },
  overdue: {
    icon: AlarmClockIcon,
    toneClassName: "bg-destructive/10 text-destructive",
    categoryId: "tasks",
  },
  team_morning: {
    icon: UsersIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
  },
}

export function noticeLook(kind: ProjectNoticeKind): AppNoticeDetail {
  return LOOK[kind]
}

/** My dashboard, where several reminders at once are listed. */
export const MY_DASHBOARD_HREF = "/dashboard"

/** The team's Members page. */
export const MEMBERS_HREF = "/team/members"

/** The Team dashboard on one day. */
export function teamDayHref(day: string) {
  return `/team?day=${encodeURIComponent(day)}`
}

/** Where a task opens: its project page with the task open in the middle panel. */
export function taskHref(projectId: string, taskId: string) {
  return `/projects/${encodeURIComponent(projectId)}?task=${encodeURIComponent(taskId)}`
}
