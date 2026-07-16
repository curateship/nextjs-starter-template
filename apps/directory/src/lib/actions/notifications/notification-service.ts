
import { eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { authUsers, hubNotifications } from '@/lib/db/schema'

export type HubNotificationType = 'product_order' | 'directory_claim' | 'directory_owner_edit' | 'directory_featured' | 'newsletter_paused'

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
    const recipients = await db
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(eq(authUsers.role, 'super_admin'))

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
