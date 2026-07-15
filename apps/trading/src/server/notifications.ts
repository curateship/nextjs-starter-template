import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  alertEvents,
  customShellFeedback,
  customShellNotifications,
  customShellUsers,
  marketScannerAlerts,
  marketScannerRules,
  scannerAlerts,
  tradingNotifications,
  type CustomShellNotification,
  type CustomShellUser,
} from "@/server/schema"
import { findCurrentUser, now } from "@/server/security"
import type {
  NotificationDeleteTarget,
  NotificationItem,
} from "@/lib/api/notification"

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

export async function deleteAdminNotificationRows(
  targets: NotificationDeleteTarget[],
  database: CustomShellDb = db
) {
  requireAppOrigin()
  const user = await requireAdminNotificationUser()
  const idsByKind = new Map<NotificationDeleteTarget["kind"], string[]>()
  for (const target of targets) {
    const ids = idsByKind.get(target.kind) ?? []
    ids.push(target.id)
    idsByKind.set(target.kind, ids)
  }

  return database.transaction(async (transaction) => {
    let count = 0
    const feedbackIds = idsByKind.get("feedback")
    if (feedbackIds?.length) {
      count += (
        await transaction
          .delete(customShellNotifications)
          .where(inArray(customShellNotifications.id, feedbackIds))
          .returning({ id: customShellNotifications.id })
      ).length
    }
    const alertIds = idsByKind.get("alert")
    if (alertIds?.length) {
      count += (
        await transaction
          .delete(scannerAlerts)
          .where(inArray(scannerAlerts.id, alertIds))
          .returning({ id: scannerAlerts.id })
      ).length
    }
    const tradingIds = idsByKind.get("trading")
    if (tradingIds?.length) {
      count += (
        await transaction
          .delete(tradingNotifications)
          .where(
            and(
              eq(tradingNotifications.userId, user.id),
              inArray(tradingNotifications.id, tradingIds)
            )
          )
          .returning({ id: tradingNotifications.id })
      ).length
    }
    const marketIds = idsByKind.get("market")
    if (marketIds?.length) {
      const affectedRules = await transaction
        .select({ id: marketScannerAlerts.ruleId })
        .from(marketScannerAlerts)
        .where(
          and(
            eq(marketScannerAlerts.userId, user.id),
            inArray(marketScannerAlerts.id, marketIds),
            isNotNull(marketScannerAlerts.ruleId)
          )
        )
      count += (
        await transaction
          .delete(marketScannerAlerts)
          .where(
            and(
              eq(marketScannerAlerts.userId, user.id),
              inArray(marketScannerAlerts.id, marketIds)
            )
          )
          .returning({ id: marketScannerAlerts.id })
      ).length
      const ruleIds = affectedRules.flatMap((row) =>
        row.id === null ? [] : [row.id]
      )
      if (ruleIds.length) {
        await transaction
          .update(marketScannerRules)
          .set({
            lastTriggeredAt: sql`(
              select max(${marketScannerAlerts.occurredAt})
              from ${marketScannerAlerts}
              where ${marketScannerAlerts.ruleId} = ${marketScannerRules.id}
            )`,
          })
          .where(
            and(
              eq(marketScannerRules.userId, user.id),
              inArray(marketScannerRules.id, ruleIds)
            )
          )
      }
    }
    const priceAlertIds = idsByKind.get("priceAlert")
    if (priceAlertIds?.length) {
      count += (
        await transaction
          .delete(alertEvents)
          .where(
            and(
              eq(alertEvents.userId, user.id),
              inArray(alertEvents.id, priceAlertIds)
            )
          )
          .returning({ id: alertEvents.id })
      ).length
    }
    return { count }
  })
}

export async function clearAdminNotificationRows(database: CustomShellDb = db) {
  requireAppOrigin()
  const user = await requireAdminNotificationUser()
  return database.transaction(async (transaction) => {
    const deleted = [
      await transaction
        .delete(customShellNotifications)
        .returning({ id: customShellNotifications.id }),
      await transaction
        .delete(scannerAlerts)
        .returning({ id: scannerAlerts.id }),
      await transaction
        .delete(tradingNotifications)
        .where(eq(tradingNotifications.userId, user.id))
        .returning({ id: tradingNotifications.id }),
      await transaction
        .delete(marketScannerAlerts)
        .where(eq(marketScannerAlerts.userId, user.id))
        .returning({ id: marketScannerAlerts.id }),
      await transaction
        .delete(alertEvents)
        .where(eq(alertEvents.userId, user.id))
        .returning({ id: alertEvents.id }),
    ]
    await transaction
      .update(marketScannerRules)
      .set({ lastTriggeredAt: null })
      .where(eq(marketScannerRules.userId, user.id))
    return { count: deleted.reduce((total, rows) => total + rows.length, 0) }
  })
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
    conditions.push(
      eq(customShellNotifications.recipientUserId, currentUser.id)
    )
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

async function serializeNotificationRows(
  rows: CustomShellNotification[],
  database: CustomShellDb
) {
  if (!rows.length) {
    return []
  }

  const userIds = Array.from(
    new Set(rows.flatMap((row) => [row.actorUserId, row.recipientUserId]))
  )
  const feedbackIds = Array.from(new Set(rows.map((row) => row.feedbackId)))
  const userRows = await database
    .select({ id: customShellUsers.id, name: customShellUsers.name })
    .from(customShellUsers)
    .where(inArray(customShellUsers.id, userIds))
  const feedbackRows = await database
    .select({
      id: customShellFeedback.id,
      message: customShellFeedback.message,
    })
    .from(customShellFeedback)
    .where(inArray(customShellFeedback.id, feedbackIds))

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
    feedback_message:
      feedbackMessages.get(row.feedbackId) ?? "Deleted feedback",
    read_at: row.readAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  }))
}
