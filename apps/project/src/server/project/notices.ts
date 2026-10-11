import { and, eq, inArray } from "drizzle-orm"

import {
  CHECKIN_HREF,
  CHECKIN_REMINDER_DETAIL,
  CHECKIN_REMINDER_HEADING,
  MY_DASHBOARD_HREF,
  noticeHeading,
  taskHref,
  type ProjectNoticeKind,
  type TaskNoticeKind,
} from "@/lib/project/notices"
import { uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { publishNotificationCreatedMany } from "@/server/notifications/events"
import type { ProjectDb } from "@/server/project/access"
import { projectNoticeLinks } from "@/server/project/schema"
import { customShellNotifications } from "@/server/schema"

export type TaskNotice = {
  kind: TaskNoticeKind
  recipientUserId: string
  actor: { id: string; name: string }
  task: { id: string; projectId: string; title: string }
  /** A reason or a line of the comment, shown after the task's title. */
  extra?: string | null
  /** How many tasks, for a notice about several at once. */
  count?: number
  /** The line under the heading, when it isn't the task's title. */
  detail?: string
}

/** The few things about a task a notice needs. */
export function taskRef(task: { id: string; projectId: string; title: string }) {
  return { id: task.id, projectId: task.projectId, title: task.title }
}

/**
 * Writes task notices and nudges each recipient's bell.
 *
 * Nobody is ever told about their own action, so a notice addressed to its
 * actor is dropped here rather than at every call site. Pass the transaction
 * the change runs in, so the notice and the change commit or vanish together
 * and the bell's nudge waits for the commit.
 */
export async function writeTaskNotices(
  database: ProjectDb,
  notices: readonly TaskNotice[]
) {
  const seen = new Set<string>()
  const rows = notices
    .filter((notice) => notice.recipientUserId !== notice.actor.id)
    .filter((notice) => {
      const key = `${notice.kind}:${notice.recipientUserId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((notice) => ({ ...notice, id: uuid() }))
  if (rows.length === 0) return

  const createdAt = new Date()
  await database.insert(customShellNotifications).values(
    rows.map((row) => ({
      id: row.id,
      recipientUserId: row.recipientUserId,
      actorUserId: row.actor.id,
      // `app_activity` is the one type the shell's CHECK constraint keeps for
      // an app; what kind of notice it is lives in `project_notice_links`.
      type: "app_activity",
      message: noticeHeading(row.kind, row.actor.name, row.count),
      detail: row.detail ?? (row.extra ? `${row.task.title}: ${row.extra}` : row.task.title),
      createdAt,
    }))
  )
  await database.insert(projectNoticeLinks).values(
    rows.map((row) => ({
      noticeId: row.id,
      kind: row.kind,
      // Several tasks at once are listed on My dashboard rather than opened one by one.
      href: row.kind === "tasks_handed" ? MY_DASHBOARD_HREF : taskHref(row.task.projectId, row.task.id),
    }))
  )
  await publishNotificationCreatedMany(
    rows.map((row) => row.recipientUserId),
    database
  )
}

export type AppNotice = {
  kind: ProjectNoticeKind
  recipientUserId: string
  message: string
  detail: string
  href: string
}

/**
 * Notices the app sends rather than a person: the check-in reminder, due
 * dates and the team's morning. They have no actor. Pass the transaction that
 * claimed them, so the claim and the notice commit or vanish together.
 */
export async function writeAppNotices(database: ProjectDb, notices: readonly AppNotice[]) {
  if (notices.length === 0) return
  const rows = notices.map((notice) => ({ ...notice, id: uuid() }))
  const createdAt = new Date()
  await database.insert(customShellNotifications).values(
    rows.map((row) => ({
      id: row.id,
      recipientUserId: row.recipientUserId,
      actorUserId: null,
      type: "app_activity",
      message: row.message,
      detail: row.detail,
      createdAt,
    }))
  )
  await database
    .insert(projectNoticeLinks)
    .values(rows.map((row) => ({ noticeId: row.id, kind: row.kind, href: row.href })))
  await publishNotificationCreatedMany(
    [...new Set(rows.map((row) => row.recipientUserId))],
    database
  )
}

/** The morning check-in reminder. */
export async function writeCheckinReminder(database: ProjectDb, recipientUserId: string) {
  await writeAppNotices(database, [
    {
      kind: "checkin_reminder",
      recipientUserId,
      message: CHECKIN_REMINDER_HEADING,
      detail: CHECKIN_REMINDER_DETAIL,
      href: CHECKIN_HREF,
    },
  ])
}

export type ProjectNoticeDetail = { kind: string; href: string }

/** Where each of this reader's own Project notices opens. */
export async function projectNoticeDetailsFor(
  userId: string,
  notificationIds: readonly string[],
  database = db
): Promise<Record<string, ProjectNoticeDetail>> {
  if (notificationIds.length === 0) return {}
  const rows = await database
    .select({
      id: projectNoticeLinks.noticeId,
      kind: projectNoticeLinks.kind,
      href: projectNoticeLinks.href,
    })
    .from(projectNoticeLinks)
    .innerJoin(
      customShellNotifications,
      eq(customShellNotifications.id, projectNoticeLinks.noticeId)
    )
    .where(
      and(
        inArray(projectNoticeLinks.noticeId, [...notificationIds]),
        eq(customShellNotifications.recipientUserId, userId)
      )
    )
  return Object.fromEntries(
    rows.map((row) => [row.id, { kind: row.kind, href: row.href }])
  )
}
