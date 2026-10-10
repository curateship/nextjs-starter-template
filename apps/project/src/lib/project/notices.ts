import {
  CalendarCheckIcon,
  CircleAlertIcon,
  ClipboardListIcon,
  MessageSquareIcon,
  UndoIcon,
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
  "task_comment",
] as const
export type TaskNoticeKind = (typeof TASK_NOTICE_KINDS)[number]

const PROJECT_NOTICE_KINDS = [...TASK_NOTICE_KINDS, "checkin_reminder"] as const
export type ProjectNoticeKind = (typeof PROJECT_NOTICE_KINDS)[number]

/** The check-in reminder has no actor, so its heading is the whole sentence. */
export const CHECKIN_REMINDER_HEADING = "Time to check in"
export const CHECKIN_REMINDER_DETAIL = "Pick the tasks you'll work on today."
/** My dashboard with the check-in window open. */
export const CHECKIN_HREF = "/dashboard?checkin=true"

const HEADING_ENDING: Record<TaskNoticeKind, string> = {
  task_assigned: " gave you a task",
  task_handed_back: " handed a task back to you",
  task_stuck: " marked a task Stuck",
  task_comment: " commented on a task",
}

/** "Anna gave you a task". */
export function noticeHeading(kind: TaskNoticeKind, actorName: string) {
  return `${actorName}${HEADING_ENDING[kind]}`
}

export function noticeKindFromWords(
  notice: Pick<NoticeToLink, "type" | "message">
): ProjectNoticeKind | null {
  if (notice.type !== "app_activity" || !notice.message) return null
  if (notice.message === CHECKIN_REMINDER_HEADING) return "checkin_reminder"
  return (
    TASK_NOTICE_KINDS.find((kind) =>
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
  task_comment: {
    icon: MessageSquareIcon,
    toneClassName: "bg-secondary text-secondary-foreground",
    categoryId: "tasks",
  },
  checkin_reminder: {
    icon: CalendarCheckIcon,
    toneClassName: "bg-primary/10 text-primary",
    categoryId: "tasks",
    href: CHECKIN_HREF,
  },
}

export function noticeLook(kind: ProjectNoticeKind): AppNoticeDetail {
  return LOOK[kind]
}

/** Where a task opens: its project page with the task's window open. */
export function taskHref(projectId: string, taskId: string) {
  return `/projects/${encodeURIComponent(projectId)}?task=${encodeURIComponent(taskId)}`
}
