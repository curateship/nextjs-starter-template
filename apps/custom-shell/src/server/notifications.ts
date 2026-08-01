import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  customShellAnnouncements,
  customShellChangelogEntries,
  customShellFeedback,
  customShellNotifications,
  customShellUsers,
  type CustomShellNotification,
  type CustomShellUser,
} from "@/server/schema"
import { findCurrentUser, now } from "@/server/security"
import type { NotificationItem } from "@/lib/api/notification"

type NotificationListResponse = {
  notifications: NotificationItem[]
  next_cursor: string | null
  unread_count: number
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const CURSOR_SEPARATOR = "|"

export async function listCurrentUserNotificationPage({
  cursor,
  limit,
}: {
  cursor?: string
  limit?: number
}) {
  const user = await requireNotificationUser()

  return getNotificationPage({
    currentUser: user,
    cursor,
    limit,
    database: db,
  })
}

export async function listAdminNotificationPage({
  cursor,
  limit,
}: {
  cursor?: string
  limit?: number
}) {
  const user = await requireAdminNotificationUser()

  return getNotificationPage({
    currentUser: user,
    cursor,
    limit,
    includeAll: true,
    database: db,
  })
}

/**
 * How many notices this person has not read. The shell asks on every bootstrap
 * so the bell can carry its dot on arrival — without it the tray only knows its
 * own count after you have already opened it, which is too late to tell you
 * anything.
 */
export async function countUnreadNotifications(
  userId: string,
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(customShellNotifications)
    .where(
      and(
        eq(customShellNotifications.recipientUserId, userId),
        isNull(customShellNotifications.readAt)
      )
    )

  return row?.count ?? 0
}

export async function markCurrentUserNotificationRead(notificationId: string) {
  requireAppOrigin()
  const user = await requireNotificationUser()
  const readAt = now()

  const [row] = await db
    .update(customShellNotifications)
    .set({ readAt })
    .where(
      and(
        eq(customShellNotifications.id, notificationId),
        eq(customShellNotifications.recipientUserId, user.id)
      )
    )
    .returning({ id: customShellNotifications.id })

  if (!row) {
    throw new Error("Notification not found")
  }

  return { notificationId: row.id, readAt: readAt.toISOString() }
}

export async function markAllCurrentUserNotificationsRead() {
  requireAppOrigin()
  const user = await requireNotificationUser()
  const readAt = now()

  const rows = await db
    .update(customShellNotifications)
    .set({ readAt })
    .where(
      and(
        eq(customShellNotifications.recipientUserId, user.id),
        isNull(customShellNotifications.readAt)
      )
    )
    .returning({ id: customShellNotifications.id })

  return {
    notificationIds: rows.map((row) => row.id),
    readAt: readAt.toISOString(),
  }
}

export async function deleteAdminNotificationRows(notificationIds: string[]) {
  requireAppOrigin()
  await requireAdminNotificationUser()

  const rows = await db
    .delete(customShellNotifications)
    .where(inArray(customShellNotifications.id, notificationIds))
    .returning({ id: customShellNotifications.id })

  return { count: rows.length }
}

export async function clearAdminNotificationRows() {
  requireAppOrigin()
  await requireAdminNotificationUser()

  const rows = await db
    .delete(customShellNotifications)
    .returning({ id: customShellNotifications.id })

  return { count: rows.length }
}

async function requireNotificationUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

async function requireAdminNotificationUser() {
  const user = await requireNotificationUser()
  if (!canViewAllNotifications(user)) {
    throw new Error("Not authorized")
  }
  return user
}

export function canViewAllNotifications(user: Pick<CustomShellUser, "role">) {
  return user.role === "admin"
}

export async function getNotificationPage({
  currentUser,
  cursor,
  limit = DEFAULT_PAGE_SIZE,
  includeAll = false,
  database = db,
}: {
  currentUser: Pick<CustomShellUser, "id" | "role">
  cursor?: string
  limit?: number
  includeAll?: boolean
  database?: CustomShellDb
}): Promise<NotificationListResponse> {
  if (includeAll && !canViewAllNotifications(currentUser)) {
    throw new Error("Not authorized")
  }

  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE)
  const conditions: SQL[] = []

  if (!includeAll) {
    conditions.push(eq(customShellNotifications.recipientUserId, currentUser.id))
  }
  if (cursor) {
    const [createdAtValue, id] = cursor.split(CURSOR_SEPARATOR)
    const createdAt = new Date(createdAtValue ?? "")
    if (!createdAtValue || !id || Number.isNaN(createdAt.getTime())) {
      throw new Error("Invalid notification cursor")
    }

    const cursorCondition = or(
      lt(customShellNotifications.createdAt, createdAt),
      and(
        eq(customShellNotifications.createdAt, createdAt),
        lt(customShellNotifications.id, id)
      )
    )
    if (cursorCondition) {
      conditions.push(cursorCondition)
    }
  }

  const whereCondition = conditions.length ? and(...conditions) : undefined
  const rows = whereCondition
    ? await database
        .select()
        .from(customShellNotifications)
        .where(whereCondition)
        .orderBy(
          desc(customShellNotifications.createdAt),
          desc(customShellNotifications.id)
        )
        .limit(pageSize + 1)
    : await database
        .select()
        .from(customShellNotifications)
        .orderBy(
          desc(customShellNotifications.createdAt),
          desc(customShellNotifications.id)
        )
        .limit(pageSize + 1)

  const pageRows = rows.slice(0, pageSize)
  const lastRow = pageRows.at(-1)
  const unreadCondition = includeAll
    ? isNull(customShellNotifications.readAt)
    : and(
        eq(customShellNotifications.recipientUserId, currentUser.id),
        isNull(customShellNotifications.readAt)
      )
  const [unreadRow] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(customShellNotifications)
    .where(unreadCondition)

  return {
    notifications: await serializeNotificationRows(pageRows, database),
    next_cursor:
      rows.length > pageSize && lastRow
        ? `${lastRow.createdAt.toISOString()}${CURSOR_SEPARATOR}${lastRow.id}`
        : null,
    unread_count: unreadRow?.count ?? 0,
  }
}

export async function serializeNotificationRows(
  rows: CustomShellNotification[],
  database: CustomShellDb
) {
  if (!rows.length) {
    return []
  }

  // Each kind of notice fills in one of these and leaves the rest null, so each
  // lookup only asks about the rows that actually have one.
  const userIds = Array.from(
    new Set(
      rows.flatMap((row) =>
        row.actorUserId
          ? [row.actorUserId, row.recipientUserId]
          : [row.recipientUserId]
      )
    )
  )
  const feedbackIds = Array.from(
    new Set(rows.flatMap((row) => (row.feedbackId ? [row.feedbackId] : [])))
  )
  const changelogIds = Array.from(
    new Set(
      rows.flatMap((row) => (row.changelogEntryId ? [row.changelogEntryId] : []))
    )
  )
  const announcementIds = Array.from(
    new Set(rows.flatMap((row) => (row.announcementId ? [row.announcementId] : [])))
  )

  const [userRows, feedbackRows, changelogRows, announcementRows] =
    await Promise.all([
      database
        .select({
          id: customShellUsers.id,
          name: customShellUsers.name,
          avatarUrl: customShellUsers.avatarUrl,
        })
        .from(customShellUsers)
        .where(inArray(customShellUsers.id, userIds)),
      feedbackIds.length
        ? database
            .select({
              id: customShellFeedback.id,
              message: customShellFeedback.message,
            })
            .from(customShellFeedback)
            .where(inArray(customShellFeedback.id, feedbackIds))
        : [],
      changelogIds.length
        ? database
            .select({
              id: customShellChangelogEntries.id,
              title: customShellChangelogEntries.title,
            })
            .from(customShellChangelogEntries)
            .where(inArray(customShellChangelogEntries.id, changelogIds))
        : [],
      announcementIds.length
        ? database
            .select({
              id: customShellAnnouncements.id,
              title: customShellAnnouncements.title,
              body: customShellAnnouncements.body,
            })
            .from(customShellAnnouncements)
            .where(inArray(customShellAnnouncements.id, announcementIds))
        : [],
    ])

  const userNames = new Map(userRows.map((row) => [row.id, row.name]))
  const userAvatars = new Map(userRows.map((row) => [row.id, row.avatarUrl]))
  const feedbackMessages = new Map(
    feedbackRows.map((row) => [row.id, row.message])
  )
  const changelogTitles = new Map(
    changelogRows.map((row) => [row.id, row.title])
  )
  const announcements = new Map(
    announcementRows.map((row) => [row.id, row])
  )

  return rows.map((row) => ({
    id: row.id,
    type: row.type as NotificationItem["type"],
    actor_name: row.actorUserId
      ? (userNames.get(row.actorUserId) ?? "Unknown")
      : null,
    // The photo goes with the name, so a row can show whose doing it was.
    actor_avatar_url: row.actorUserId
      ? (userAvatars.get(row.actorUserId) ?? null)
      : null,
    recipient_name: userNames.get(row.recipientUserId) ?? "Unknown",
    feedback_id: row.feedbackId,
    feedback_message: row.feedbackId
      ? (feedbackMessages.get(row.feedbackId) ?? "Deleted feedback")
      : null,
    changelog_entry_id: row.changelogEntryId,
    changelog_title: row.changelogEntryId
      ? (changelogTitles.get(row.changelogEntryId) ?? "Deleted update")
      : null,
    announcement_id: row.announcementId,
    // Deleting an announcement takes its notices with it, so the fallback here
    // only ever shows during the moment between the two.
    announcement_title: row.announcementId
      ? (announcements.get(row.announcementId)?.title ?? "Deleted announcement")
      : null,
    announcement_body: row.announcementId
      ? (announcements.get(row.announcementId)?.body ?? "")
      : null,
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  }))
}
