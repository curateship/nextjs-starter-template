'use server'

import { and, desc, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/db/helpers'
import { hubNotifications, sites } from '@/lib/db/schema'
import type { HubNotificationType } from './notification-service'

export type HubNotificationItem = {
  id: string
  type: HubNotificationType
  site_id: string
  site_name: string
  title: string
  message: string
  target_href: string
  read_at: string | null
  created_at: string
}

export type HubNotificationListResponse = {
  notifications: HubNotificationItem[]
  next_cursor: string | null
  unread_count: number
}

type HubNotificationListInput = {
  siteId: string
  cursor?: string | null
  limit?: number | null
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const CURSOR_SEPARATOR = '|'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizePageSize(limit: unknown) {
  return typeof limit === 'number' && Number.isInteger(limit)
    ? Math.min(Math.max(1, limit), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE
}

function parseCursor(cursor: unknown) {
  if (typeof cursor !== 'string' || !cursor) return null

  const [createdAtValue, id] = cursor.split(CURSOR_SEPARATOR)
  const createdAt = new Date(createdAtValue ?? '')

  if (!createdAtValue || !id || !UUID_PATTERN.test(id) || Number.isNaN(createdAt.getTime())) {
    throw new Error('Invalid notification cursor')
  }

  return { createdAt, id }
}

function serializeNotification(row: {
  notification: typeof hubNotifications.$inferSelect
  siteName: string
}): HubNotificationItem {
  return {
    id: row.notification.id,
    type: row.notification.type as HubNotificationType,
    site_id: row.notification.siteId,
    site_name: row.siteName,
    title: row.notification.title,
    message: row.notification.message,
    target_href: row.notification.targetHref,
    read_at: row.notification.readAt?.toISOString() ?? null,
    created_at: row.notification.createdAt.toISOString(),
  }
}

export async function listHubNotificationPage(
  input: HubNotificationListInput
): Promise<HubNotificationListResponse> {
  if (!input || !UUID_PATTERN.test(input.siteId)) {
    throw new Error('Invalid site')
  }

  try {
    const user = await requireAdmin()
    const pageSize = normalizePageSize(input.limit)
    const cursor = parseCursor(input.cursor)
    const conditions: SQL[] = [
      eq(hubNotifications.recipientUserId, user.id),
      eq(hubNotifications.siteId, input.siteId),
    ]

    if (cursor) {
      conditions.push(or(
        lt(hubNotifications.createdAt, cursor.createdAt),
        and(
          eq(hubNotifications.createdAt, cursor.createdAt),
          lt(hubNotifications.id, cursor.id)
        )
      )!)
    }

    const rows = await db
      .select({
        notification: hubNotifications,
        siteName: sites.name,
      })
      .from(hubNotifications)
      .innerJoin(sites, eq(sites.id, hubNotifications.siteId))
      .where(and(...conditions))
      .orderBy(desc(hubNotifications.createdAt), desc(hubNotifications.id))
      .limit(pageSize + 1)

    const pageRows = rows.slice(0, pageSize)
    const lastRow = pageRows.at(-1)?.notification
    const [unreadRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hubNotifications)
      .where(and(
        eq(hubNotifications.recipientUserId, user.id),
        eq(hubNotifications.siteId, input.siteId),
        isNull(hubNotifications.readAt)
      ))

    return {
      notifications: pageRows.map(serializeNotification),
      next_cursor: rows.length > pageSize && lastRow
        ? `${lastRow.createdAt.toISOString()}${CURSOR_SEPARATOR}${lastRow.id}`
        : null,
      unread_count: unreadRow?.count ?? 0,
    }
  } catch (error) {
    console.error('Failed to list Hub notifications:', error)
    throw new Error('Failed to load notifications')
  }
}

// Cross-site variant for the multi-site admin dashboard: all of the user's notifications.
export async function listHubNotificationsForUser(
  input?: { limit?: number | null }
): Promise<HubNotificationListResponse> {
  try {
    const user = await requireAdmin()
    const pageSize = normalizePageSize(input?.limit)

    const rows = await db
      .select({
        notification: hubNotifications,
        siteName: sites.name,
      })
      .from(hubNotifications)
      .innerJoin(sites, eq(sites.id, hubNotifications.siteId))
      .where(eq(hubNotifications.recipientUserId, user.id))
      .orderBy(desc(hubNotifications.createdAt), desc(hubNotifications.id))
      .limit(pageSize)

    const [unreadRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(hubNotifications)
      .where(and(
        eq(hubNotifications.recipientUserId, user.id),
        isNull(hubNotifications.readAt)
      ))

    return {
      notifications: rows.map(serializeNotification),
      next_cursor: null,
      unread_count: unreadRow?.count ?? 0,
    }
  } catch (error) {
    console.error('Failed to list Hub notifications:', error)
    throw new Error('Failed to load notifications')
  }
}

// Cross-site variant for the multi-site admin dashboard.
export async function markAllHubNotificationsReadForUser(): Promise<{
  notificationIds: string[]
  readAt: string
}> {
  try {
    const user = await requireAdmin()
    const readAt = new Date()
    const rows = await db
      .update(hubNotifications)
      .set({ readAt })
      .where(and(
        eq(hubNotifications.recipientUserId, user.id),
        isNull(hubNotifications.readAt)
      ))
      .returning({ id: hubNotifications.id })

    return {
      notificationIds: rows.map((row) => row.id),
      readAt: readAt.toISOString(),
    }
  } catch (error) {
    console.error('Failed to mark Hub notifications read:', error)
    throw new Error('Failed to update notifications')
  }
}

export async function markHubNotificationRead(notificationId: string, siteId: string): Promise<{
  notificationId: string
  readAt: string
}> {
  if (!UUID_PATTERN.test(notificationId)) {
    throw new Error('Invalid notification')
  }
  if (!UUID_PATTERN.test(siteId)) {
    throw new Error('Invalid site')
  }

  try {
    const user = await requireAdmin()
    const readAt = new Date()
    const [row] = await db
      .update(hubNotifications)
      .set({ readAt })
      .where(and(
        eq(hubNotifications.id, notificationId),
        eq(hubNotifications.siteId, siteId),
        eq(hubNotifications.recipientUserId, user.id)
      ))
      .returning({ id: hubNotifications.id })

    if (!row) throw new Error('Notification not found')

    return { notificationId: row.id, readAt: readAt.toISOString() }
  } catch (error) {
    console.error('Failed to mark Hub notification read:', error)
    throw new Error('Failed to update notification')
  }
}

export async function markAllHubNotificationsRead(siteId: string): Promise<{
  notificationIds: string[]
  readAt: string
}> {
  if (!UUID_PATTERN.test(siteId)) {
    throw new Error('Invalid site')
  }

  try {
    const user = await requireAdmin()
    const readAt = new Date()
    const rows = await db
      .update(hubNotifications)
      .set({ readAt })
      .where(and(
        eq(hubNotifications.recipientUserId, user.id),
        eq(hubNotifications.siteId, siteId),
        isNull(hubNotifications.readAt)
      ))
      .returning({ id: hubNotifications.id })

    return {
      notificationIds: rows.map((row) => row.id),
      readAt: readAt.toISOString(),
    }
  } catch (error) {
    console.error('Failed to mark Hub notifications read:', error)
    throw new Error('Failed to update notifications')
  }
}
