import { and, eq, inArray } from "drizzle-orm"

import {
  noticeHeading,
  taskHref,
  type ProjectNoticeKind,
} from "@/lib/project/notices"
import { uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { publishNotificationCreatedMany } from "@/server/notifications/events"
import type { ProjectDb } from "@/server/project/access"
import { projectNoticeLinks } from "@/server/project/schema"
import { customShellNotifications } from "@/server/schema"

export type TaskNotice = {
  kind: ProjectNoticeKind
  recipientUserId: string
  actor: { id: string; name: string }
  task: { id: string; projectId: string; title: string }
  /** A reason or a line of the comment, shown after the task's title. */
  extra?: string | null
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
      message: noticeHeading(row.kind, row.actor.name),
      detail: row.extra ? `${row.task.title}: ${row.extra}` : row.task.title,
      createdAt,
    }))
  )
  await database.insert(projectNoticeLinks).values(
    rows.map((row) => ({
      noticeId: row.id,
      kind: row.kind,
      href: taskHref(row.task.projectId, row.task.id),
    }))
  )
  await publishNotificationCreatedMany(
    rows.map((row) => row.recipientUserId),
    database
  )
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
