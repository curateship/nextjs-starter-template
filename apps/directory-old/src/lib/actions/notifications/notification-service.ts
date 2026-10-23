
import { and, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { authUsers, hubNotificationPreferences, hubNotifications } from '@/lib/db/schema'
import { pickNotificationRecipients, type HubNotificationType } from './notification-kinds'

export type { HubNotificationType }

type CreateHubNotificationInput = {
  type: HubNotificationType
  siteId: string
  sourceId: string
  title: string
  message: string
  targetHref: string
  metadata?: Record<string, unknown>
}

function isSafeAdminHref(value: string) {
  return (
    (value === '/admin' || value.startsWith('/admin/') || value.startsWith('/admin?')) &&
    !value.includes('\\')
  )
}

export async function createHubNotificationForSuperAdmins(input: CreateHubNotificationInput) {
  if (!isSafeAdminHref(input.targetHref)) {
    throw new Error('Invalid notification target')
  }

  try {
    const superAdmins = await db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.role, 'super_admin'))

    // Anyone who switched this kind off for this site is skipped. A person
    // with no saved preference always receives it.
    const mutedRows = await db
      .select({
        userId: hubNotificationPreferences.userId,
        type: hubNotificationPreferences.type,
        enabled: hubNotificationPreferences.enabled,
      })
      .from(hubNotificationPreferences)
      .where(and(
        eq(hubNotificationPreferences.siteId, input.siteId),
        eq(hubNotificationPreferences.type, input.type),
        eq(hubNotificationPreferences.enabled, false)
      ))

    const recipients = pickNotificationRecipients(superAdmins, mutedRows, input.type)
    if (!recipients.length) return

    await db
      .insert(hubNotifications)
      .values(recipients.map((recipient) => ({
        recipientUserId: recipient.id,
        siteId: input.siteId,
        type: input.type,
        sourceId: input.sourceId,
        title: input.title.slice(0, 255),
        message: input.message,
        targetHref: input.targetHref,
        metadata: input.metadata ?? {},
      })))
      .onConflictDoNothing({
        target: [
          hubNotifications.recipientUserId,
          hubNotifications.type,
          hubNotifications.sourceId,
        ],
      })
  } catch (error) {
    console.error('Failed to create Hub notification:', error)
  }
}
