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

import { db, type AiAgentsDb } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  aiAgentsFeedback,
  aiAgentsNotifications,
  aiAgentsUsers,
  type AiAgentsNotification,
  type AiAgentsUser,
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

export async function markCurrentUserNotificationRead(notificationId: string) {
  requireAppOrigin()
  const user = await requireNotificationUser()
  const readAt = now()

  const [row] = await db
    .update(aiAgentsNotifications)
    .set({ readAt })
    .where(
      and(
        eq(aiAgentsNotifications.id, notificationId),
        eq(aiAgentsNotifications.recipientUserId, user.id)
      )
    )
    .returning({ id: aiAgentsNotifications.id })

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
    .update(aiAgentsNotifications)
    .set({ readAt })
    .where(
      and(
        eq(aiAgentsNotifications.recipientUserId, user.id),
        isNull(aiAgentsNotifications.readAt)
      )
    )
    .returning({ id: aiAgentsNotifications.id })

  return {
    notificationIds: rows.map((row) => row.id),
    readAt: readAt.toISOString(),
  }
}

async function requireNotificationUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing AI Agents session")
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

export function canViewAllNotifications(user: Pick<AiAgentsUser, "role">) {
  return user.role === "admin"
}

export async function getNotificationPage({
  currentUser,
  cursor,
  limit = DEFAULT_PAGE_SIZE,
  includeAll = false,
  database = db,
}: {
  currentUser: Pick<AiAgentsUser, "id" | "role">
  cursor?: string
  limit?: number
  includeAll?: boolean
  database?: AiAgentsDb
}): Promise<NotificationListResponse> {
  if (includeAll && !canViewAllNotifications(currentUser)) {
    throw new Error("Not authorized")
  }

  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE)
  const conditions: SQL[] = []

  if (!includeAll) {
    conditions.push(eq(aiAgentsNotifications.recipientUserId, currentUser.id))
  }
  if (cursor) {
    const [createdAtValue, id] = cursor.split(CURSOR_SEPARATOR)
    const createdAt = new Date(createdAtValue ?? "")
    if (!createdAtValue || !id || Number.isNaN(createdAt.getTime())) {
      throw new Error("Invalid notification cursor")
    }

    const cursorCondition = or(
      lt(aiAgentsNotifications.createdAt, createdAt),
      and(
        eq(aiAgentsNotifications.createdAt, createdAt),
        lt(aiAgentsNotifications.id, id)
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
        .from(aiAgentsNotifications)
        .where(whereCondition)
        .orderBy(
          desc(aiAgentsNotifications.createdAt),
          desc(aiAgentsNotifications.id)
        )
        .limit(pageSize + 1)
    : await database
        .select()
        .from(aiAgentsNotifications)
        .orderBy(
          desc(aiAgentsNotifications.createdAt),
          desc(aiAgentsNotifications.id)
        )
        .limit(pageSize + 1)

  const pageRows = rows.slice(0, pageSize)
  const lastRow = pageRows.at(-1)
  const unreadCondition = includeAll
    ? isNull(aiAgentsNotifications.readAt)
    : and(
        eq(aiAgentsNotifications.recipientUserId, currentUser.id),
        isNull(aiAgentsNotifications.readAt)
      )
  const [unreadRow] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(aiAgentsNotifications)
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

async function serializeNotificationRows(
  rows: AiAgentsNotification[],
  database: AiAgentsDb
) {
  if (!rows.length) {
    return []
  }

  const userIds = Array.from(
    new Set(rows.flatMap((row) => [row.actorUserId, row.recipientUserId]))
  )
  const feedbackIds = Array.from(new Set(rows.map((row) => row.feedbackId)))
  const userRows = await database
    .select({ id: aiAgentsUsers.id, name: aiAgentsUsers.name })
    .from(aiAgentsUsers)
    .where(inArray(aiAgentsUsers.id, userIds))
  const feedbackRows = await database
    .select({ id: aiAgentsFeedback.id, message: aiAgentsFeedback.message })
    .from(aiAgentsFeedback)
    .where(inArray(aiAgentsFeedback.id, feedbackIds))

  const userNames = new Map(userRows.map((row) => [row.id, row.name]))
  const feedbackMessages = new Map(
    feedbackRows.map((row) => [row.id, row.message])
  )

  return rows.map((row) => ({
    id: row.id,
    type: row.type as NotificationItem["type"],
    actor_name: userNames.get(row.actorUserId) ?? "Unknown",
    recipient_name: userNames.get(row.recipientUserId) ?? "Unknown",
    feedback_id: row.feedbackId,
    feedback_message: feedbackMessages.get(row.feedbackId) ?? "Deleted feedback",
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  }))
}
