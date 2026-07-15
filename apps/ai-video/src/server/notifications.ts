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

import { db, type AiVideoDb } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoCreators,
  aiVideoFeedback,
  aiVideoNotifications,
  aiVideoUsers,
  type AiVideoNotification,
  type AiVideoUser,
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
    .update(aiVideoNotifications)
    .set({ readAt })
    .where(
      and(
        eq(aiVideoNotifications.id, notificationId),
        eq(aiVideoNotifications.recipientUserId, user.id)
      )
    )
    .returning({ id: aiVideoNotifications.id })

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
    .update(aiVideoNotifications)
    .set({ readAt })
    .where(
      and(
        eq(aiVideoNotifications.recipientUserId, user.id),
        isNull(aiVideoNotifications.readAt)
      )
    )
    .returning({ id: aiVideoNotifications.id })

  return {
    notificationIds: rows.map((row) => row.id),
    readAt: readAt.toISOString(),
  }
}

export async function deleteAdminNotificationRows(notificationIds: string[]) {
  requireAppOrigin()
  await requireAdminNotificationUser()

  const rows = await db
    .delete(aiVideoNotifications)
    .where(inArray(aiVideoNotifications.id, notificationIds))
    .returning({ id: aiVideoNotifications.id })

  return { count: rows.length }
}

export async function clearAdminNotificationRows() {
  requireAppOrigin()
  await requireAdminNotificationUser()

  const rows = await db
    .delete(aiVideoNotifications)
    .returning({ id: aiVideoNotifications.id })

  return { count: rows.length }
}

async function requireNotificationUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing AI Video session")
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

export function canViewAllNotifications(user: Pick<AiVideoUser, "role">) {
  return user.role === "admin"
}

export async function getNotificationPage({
  currentUser,
  cursor,
  limit = DEFAULT_PAGE_SIZE,
  includeAll = false,
  database = db,
}: {
  currentUser: Pick<AiVideoUser, "id" | "role">
  cursor?: string
  limit?: number
  includeAll?: boolean
  database?: AiVideoDb
}): Promise<NotificationListResponse> {
  if (includeAll && !canViewAllNotifications(currentUser)) {
    throw new Error("Not authorized")
  }

  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE)
  const conditions: SQL[] = []

  if (!includeAll) {
    conditions.push(eq(aiVideoNotifications.recipientUserId, currentUser.id))
  }
  if (cursor) {
    const [createdAtValue, id] = cursor.split(CURSOR_SEPARATOR)
    const createdAt = new Date(createdAtValue ?? "")
    if (!createdAtValue || !id || Number.isNaN(createdAt.getTime())) {
      throw new Error("Invalid notification cursor")
    }

    const cursorCondition = or(
      lt(aiVideoNotifications.createdAt, createdAt),
      and(
        eq(aiVideoNotifications.createdAt, createdAt),
        lt(aiVideoNotifications.id, id)
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
        .from(aiVideoNotifications)
        .where(whereCondition)
        .orderBy(
          desc(aiVideoNotifications.createdAt),
          desc(aiVideoNotifications.id)
        )
        .limit(pageSize + 1)
    : await database
        .select()
        .from(aiVideoNotifications)
        .orderBy(
          desc(aiVideoNotifications.createdAt),
          desc(aiVideoNotifications.id)
        )
        .limit(pageSize + 1)

  const pageRows = rows.slice(0, pageSize)
  const lastRow = pageRows.at(-1)
  const unreadCondition = includeAll
    ? isNull(aiVideoNotifications.readAt)
    : and(
        eq(aiVideoNotifications.recipientUserId, currentUser.id),
        isNull(aiVideoNotifications.readAt)
      )
  const [unreadRow] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(aiVideoNotifications)
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
  rows: AiVideoNotification[],
  database: AiVideoDb
) {
  if (!rows.length) {
    return []
  }

  const userIds = Array.from(
    new Set(rows.flatMap((row) => [row.actorUserId, row.recipientUserId]))
  )
  const feedbackIds = Array.from(
    new Set(
      rows
        .map((row) => row.feedbackId)
        .filter((id): id is string => Boolean(id))
    )
  )
  const creatorIds = Array.from(
    new Set(
      rows.map((row) => row.creatorId).filter((id): id is string => Boolean(id))
    )
  )
  const userRows = await database
    .select({ id: aiVideoUsers.id, name: aiVideoUsers.name })
    .from(aiVideoUsers)
    .where(inArray(aiVideoUsers.id, userIds))
  const feedbackRows = feedbackIds.length
    ? await database
        .select({ id: aiVideoFeedback.id, message: aiVideoFeedback.message })
        .from(aiVideoFeedback)
        .where(inArray(aiVideoFeedback.id, feedbackIds))
    : []
  const creatorRows = creatorIds.length
    ? await database
        .select({
          id: aiVideoCreators.id,
          username: aiVideoCreators.username,
          displayName: aiVideoCreators.displayName,
        })
        .from(aiVideoCreators)
        .where(inArray(aiVideoCreators.id, creatorIds))
    : []

  const userNames = new Map(userRows.map((row) => [row.id, row.name]))
  const feedbackMessages = new Map(
    feedbackRows.map((row) => [row.id, row.message])
  )
  const creators = new Map(creatorRows.map((row) => [row.id, row]))

  return rows.map((row) => {
    const creator = row.creatorId ? creators.get(row.creatorId) : null
    return {
      id: row.id,
      type: row.type as NotificationItem["type"],
      actor_name: userNames.get(row.actorUserId) ?? "Unknown",
      recipient_name: userNames.get(row.recipientUserId) ?? "Unknown",
      feedback_id: row.feedbackId,
      feedback_message: row.feedbackId
        ? (feedbackMessages.get(row.feedbackId) ?? "Deleted feedback")
        : null,
      creator_id: row.creatorId,
      creator_username: creator?.username ?? null,
      creator_display_name: creator?.displayName ?? null,
      creator_new_video_count: row.creatorNewVideoCount,
      api_usage_level: row.apiUsageLevel as NotificationItem["api_usage_level"],
      api_usage_period_start: row.apiUsagePeriodStart?.toISOString() ?? null,
      api_usage_used_credits: row.apiUsageUsedCredits,
      api_usage_limit_credits: row.apiUsageLimitCredits,
      read_at: row.readAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
    }
  })
}
