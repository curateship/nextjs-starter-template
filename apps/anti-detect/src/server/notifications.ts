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

import { db, type Db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  feedback,
  notifications,
  users,
  type Notification,
  type User,
} from "@/server/schema"
import { findCurrentUser, now, uuid } from "@/server/security"
import type {
  AlertNotificationType,
  NotificationItem,
  NotificationSeverity,
} from "@/lib/api/notification"

type CreateAlertInput = {
  recipientUserId: string
  type: AlertNotificationType
  severity: NotificationSeverity
  title: string
  body?: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
  database?: Db
}

/**
 * Record an operational alert in the shared notifications table. Alerts have no
 * actor and no feedback link. Emission must never break the operation that
 * triggered it, so a failed insert is logged, not thrown.
 */
export async function createAlert({
  recipientUserId,
  type,
  severity,
  title,
  body,
  entityType,
  entityId,
  metadata,
  database = db,
}: CreateAlertInput) {
  try {
    await database.insert(notifications).values({
      id: uuid(),
      recipientUserId,
      actorUserId: null,
      feedbackId: null,
      type,
      severity,
      title,
      body: body ?? null,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
      metadata: metadata ?? null,
      createdAt: now(),
    })
  } catch (error) {
    console.error("[alerts] failed to record alert", {
      type,
      entityId,
      error,
    })
  }
}

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
    .update(notifications)
    .set({ readAt })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientUserId, user.id)
      )
    )
    .returning({ id: notifications.id })

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
    .update(notifications)
    .set({ readAt })
    .where(
      and(
        eq(notifications.recipientUserId, user.id),
        isNull(notifications.readAt)
      )
    )
    .returning({ id: notifications.id })

  return {
    notificationIds: rows.map((row) => row.id),
    readAt: readAt.toISOString(),
  }
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

export function canViewAllNotifications(user: Pick<User, "role">) {
  return user.role === "admin"
}

export async function getNotificationPage({
  currentUser,
  cursor,
  limit = DEFAULT_PAGE_SIZE,
  includeAll = false,
  database = db,
}: {
  currentUser: Pick<User, "id" | "role">
  cursor?: string
  limit?: number
  includeAll?: boolean
  database?: Db
}): Promise<NotificationListResponse> {
  if (includeAll && !canViewAllNotifications(currentUser)) {
    throw new Error("Not authorized")
  }

  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE)
  const conditions: SQL[] = []

  if (!includeAll) {
    conditions.push(eq(notifications.recipientUserId, currentUser.id))
  }
  if (cursor) {
    const [createdAtValue, id] = cursor.split(CURSOR_SEPARATOR)
    const createdAt = new Date(createdAtValue ?? "")
    if (!createdAtValue || !id || Number.isNaN(createdAt.getTime())) {
      throw new Error("Invalid notification cursor")
    }

    const cursorCondition = or(
      lt(notifications.createdAt, createdAt),
      and(
        eq(notifications.createdAt, createdAt),
        lt(notifications.id, id)
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
        .from(notifications)
        .where(whereCondition)
        .orderBy(
          desc(notifications.createdAt),
          desc(notifications.id)
        )
        .limit(pageSize + 1)
    : await database
        .select()
        .from(notifications)
        .orderBy(
          desc(notifications.createdAt),
          desc(notifications.id)
        )
        .limit(pageSize + 1)

  const pageRows = rows.slice(0, pageSize)
  const lastRow = pageRows.at(-1)
  const unreadCondition = includeAll
    ? isNull(notifications.readAt)
    : and(
        eq(notifications.recipientUserId, currentUser.id),
        isNull(notifications.readAt)
      )
  const [unreadRow] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
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
  rows: Notification[],
  database: Db
) {
  if (!rows.length) {
    return []
  }

  const userIds = Array.from(
    new Set(rows.flatMap((row) => [row.actorUserId, row.recipientUserId]))
  ).filter((id): id is string => Boolean(id))
  const feedbackIds = Array.from(
    new Set(rows.map((row) => row.feedbackId))
  ).filter((id): id is string => Boolean(id))
  const userRows = userIds.length
    ? await database
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, userIds))
    : []
  const feedbackRows = feedbackIds.length
    ? await database
        .select({ id: feedback.id, message: feedback.message })
        .from(feedback)
        .where(inArray(feedback.id, feedbackIds))
    : []

  const userNames = new Map(userRows.map((row) => [row.id, row.name]))
  const feedbackMessages = new Map(
    feedbackRows.map((row) => [row.id, row.message])
  )

  return rows.map((row) => ({
    id: row.id,
    type: row.type as NotificationItem["type"],
    actor_name: row.actorUserId
      ? userNames.get(row.actorUserId) ?? "Unknown"
      : null,
    recipient_name: userNames.get(row.recipientUserId) ?? "Unknown",
    feedback_id: row.feedbackId ?? null,
    feedback_message: row.feedbackId
      ? feedbackMessages.get(row.feedbackId) ?? "Deleted feedback"
      : null,
    severity: (row.severity as NotificationItem["severity"]) ?? null,
    title: row.title ?? null,
    body: row.body ?? null,
    entity_type: row.entityType ?? null,
    entity_id: row.entityId ?? null,
    metadata: (row.metadata as NotificationItem["metadata"]) ?? null,
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  }))
}
