import {
  AlarmClockIcon,
  AtSignIcon,
  BellRingIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FlagIcon,
  GaugeIcon,
  HeartIcon,
  ListChecksIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  MessageSquareReplyIcon,
  PlayIcon,
  UndoIcon,
  UserCheckIcon,
  UserPlusIcon,
  UsersIcon,
  VideoIcon,
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
  "task_review",
  "task_sent_back",
  "task_thanks",
  "task_field_person",
] as const
export type TaskNoticeKind = (typeof TASK_NOTICE_KINDS)[number]

/** Notices the app sends, with no person as the actor. */
const APP_NOTICE_KINDS = [
  "checkin_reminder",
  "due_soon",
  "overdue",
  "team_morning",
  "team_joined",
  "meeting_invite",
  "blocker_reply",
  "checkin_mention",
  "chat_mention",
  "chat_reply",
  "team_announcement",
  "task_reminder",
  "project_health",
  "milestone_due",
] as const

const PROJECT_NOTICE_KINDS = [...TASK_NOTICE_KINDS, ...APP_NOTICE_KINDS] as const
export type ProjectNoticeKind = (typeof PROJECT_NOTICE_KINDS)[number]

/** The check-in reminder has no actor, so its heading is the whole sentence. */
export const CHECKIN_REMINDER_HEADING = "Time to check in"
export const CHECKIN_REMINDER_DETAIL = "Pick the tasks you'll work on today."
/** My dashboard with the check-in window open. */
export const CHECKIN_HREF = "/dashboard?checkin=true"
/** The Team dashboard, where the announcement is pinned. */
export const TEAM_HREF = "/team"

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
  task_review: " finished a task for your review",
  task_sent_back: " sent a task back to you",
  task_thanks: " thanked you for a task",
  task_field_person: " named you on a task",
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
const MEETING_INVITE_ENDING = " invited you to a meeting"

/** "Anna invited you to a meeting". */
export function meetingInviteHeading(name: string) {
  return `${name}${MEETING_INVITE_ENDING}`
}

const BLOCKER_REPLY_ENDING = " answered your blocker"
const CHECKIN_MENTION_ENDING = " mentioned you in their check-in"

/** "Maya answered your blocker". */
export function blockerReplyHeading(name: string) {
  return `${name}${BLOCKER_REPLY_ENDING}`
}

/** "Leo mentioned you in their check-in". */
export function checkinMentionHeading(name: string) {
  return `${name}${CHECKIN_MENTION_ENDING}`
}

const CHAT_MENTION_ENDING = " tagged you in a project chat"
const CHAT_REPLY_ENDING = " replied to you in a project chat"
const ANNOUNCEMENT_ENDING = " posted an announcement"

/** "Anna tagged you in a project chat". */
export function chatMentionHeading(name: string) {
  return `${name}${CHAT_MENTION_ENDING}`
}

/** "Anna replied to you in a project chat". */
export function chatReplyHeading(name: string) {
  return `${name}${CHAT_REPLY_ENDING}`
}

/** "Maya posted an announcement". */
export function announcementHeading(name: string) {
  return `${name}${ANNOUNCEMENT_ENDING}`
}

const PROJECT_HEALTH_WORDS = / marked a project (On track|At risk|Off track)$/
const HEALTH_CLEARED_ENDING = " cleared a project's status"

/** "Sam marked a project At risk", or "Sam cleared a project's status" with no status left. */
export function projectHealthHeading(name: string, healthLabel: string | null) {
  return healthLabel ? `${name} marked a project ${healthLabel}` : `${name}${HEALTH_CLEARED_ENDING}`
}

const TASK_REMINDER_START = "Reminder: "

/** "Reminder: Write the About page", a person's own "Remind me". */
export function taskReminderHeading(title: string) {
  return `${TASK_REMINDER_START}${title}`
}
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

/** "Milestone due tomorrow", or "Milestone due Monday" when the next work day is further off. */
export function milestoneDueHeading(daysAway: number, weekday: number) {
  return `Milestone due ${daysAway === 1 ? "tomorrow" : WEEKDAY_NAMES[weekday]}`
}

export function overdueHeading(count = 1) {
  return count > 1 ? `${count} tasks overdue` : "Overdue"
}

/** "5 of 6 checked in, 1 blocked", or "5 of 6 checked in" with nobody blocked. */
export function teamMorningHeading(checkedIn: number, expected: number, blocked: number) {
  return `${checkedIn} of ${expected} checked in${blocked ? `, ${blocked} blocked` : ""}`
}

const NAMES_SHOWN = 3

/** "Not yet: Ben Tester, Carla Tester.", or "Everyone's in." */
export function teamMorningDetail(notYet: string[]) {
  if (notYet.length === 0) return "Everyone's in."
  const rest = notYet.length - NAMES_SHOWN
  const shown = notYet.slice(0, NAMES_SHOWN).join(", ")
  return `Not yet: ${rest > 0 ? `${shown} and ${rest} more` : shown}.`
}

const DUE_SOON_WORDS = new RegExp(`^(\\d+ tasks due|Due) (tomorrow|${WEEKDAY_NAMES.join("|")})$`)
const OVERDUE_WORDS = /^(Overdue|\d+ tasks overdue)$/
const MILESTONE_DUE_WORDS = new RegExp(`^Milestone due (tomorrow|${WEEKDAY_NAMES.join("|")})$`)
// Notices sent before 11 Oct 2026 always said ", 0 blocked"; both still match.
const TEAM_MORNING_WORDS = /^\d+ of \d+ checked in(, \d+ blocked)?$/

export function noticeKindFromWords(
  notice: Pick<NoticeToLink, "type" | "message">
): ProjectNoticeKind | null {
  if (notice.type !== "app_activity" || !notice.message) return null
  if (notice.message === CHECKIN_REMINDER_HEADING) return "checkin_reminder"
  // First, because a task's own title could end like another notice.
  if (notice.message.startsWith(TASK_REMINDER_START)) return "task_reminder"
  if (DUE_SOON_WORDS.test(notice.message)) return "due_soon"
  if (OVERDUE_WORDS.test(notice.message)) return "overdue"
  if (MILESTONE_DUE_WORDS.test(notice.message)) return "milestone_due"
  if (PROJECT_HEALTH_WORDS.test(notice.message)) return "project_health"
  if (notice.message.endsWith(HEALTH_CLEARED_ENDING)) return "project_health"
  if (TEAM_MORNING_WORDS.test(notice.message)) return "team_morning"
  if (notice.message.endsWith(TEAM_JOINED_ENDING)) return "team_joined"
  if (notice.message.endsWith(MEETING_INVITE_ENDING)) return "meeting_invite"
  if (notice.message.endsWith(BLOCKER_REPLY_ENDING)) return "blocker_reply"
  if (notice.message.endsWith(CHECKIN_MENTION_ENDING)) return "checkin_mention"
  if (notice.message.endsWith(CHAT_MENTION_ENDING)) return "chat_mention"
  if (notice.message.endsWith(CHAT_REPLY_ENDING)) return "chat_reply"
  if (notice.message.endsWith(ANNOUNCEMENT_ENDING)) return "team_announcement"
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
  meeting_invite: {
    icon: VideoIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
  },
  blocker_reply: {
    icon: MessageSquareReplyIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
  },
  checkin_mention: {
    icon: AtSignIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
  },
  task_review: {
    icon: ClipboardCheckIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
  },
  task_sent_back: {
    icon: UndoIcon,
    toneClassName: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    categoryId: "tasks",
  },
  task_thanks: {
    icon: HeartIcon,
    toneClassName: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    categoryId: "tasks",
  },
  chat_mention: {
    icon: AtSignIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
  },
  chat_reply: {
    icon: MessageSquareReplyIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
  },
  team_announcement: {
    icon: MegaphoneIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
    href: TEAM_HREF,
  },
  task_reminder: {
    icon: BellRingIcon,
    toneClassName: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    categoryId: "tasks",
  },
  task_field_person: {
    icon: UserCheckIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
  },
  project_health: {
    icon: GaugeIcon,
    toneClassName: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    categoryId: "tasks",
  },
  milestone_due: {
    icon: FlagIcon,
    toneClassName: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
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

/**
 * A notice for the site admin, who looks at one team at a time: opening it
 * moves their team picker to the notice's team first, then goes to `href`
 * (`routes/_authenticated/projects/team.$teamId.tsx`).
 */
export function onTeamHref(teamId: string, href: string) {
  return `/projects/team/${encodeURIComponent(teamId)}?to=${encodeURIComponent(href)}`
}

/** A project's page. */
export function projectHref(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}`
}

/** A project's page with its Chat tab open. */
export function projectChatHref(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}?chat=1`
}

/** The Team dashboard on one day. */
export function teamDayHref(day: string) {
  return `/team?day=${encodeURIComponent(day)}`
}

/** Where a task opens: its project page with the task open in the middle panel. */
export function taskHref(projectId: string, taskId: string) {
  return `/projects/${encodeURIComponent(projectId)}?task=${encodeURIComponent(taskId)}`
}
