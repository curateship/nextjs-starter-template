import { and, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/db/helpers'
import { hubNotificationPreferences } from '@/lib/db/schema'
import {
  NOTIFICATION_KINDS,
  isHubNotificationType,
  type HubNotificationType,
} from './notification-kinds'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type NotificationPreferenceMap = Record<HubNotificationType, boolean>

// Every kind switched on — what a person with no saved rows gets.
function defaultPreferences(): NotificationPreferenceMap {
  return Object.fromEntries(
    NOTIFICATION_KINDS.map((kind) => [kind.type, true])
  ) as NotificationPreferenceMap
}

/** The signed-in admin's own preferences for one site, defaults filled in. */
export async function listNotificationPreferencesImpl(
  siteId: string
): Promise<NotificationPreferenceMap> {
  if (!UUID_PATTERN.test(siteId)) {
    throw new Error('Invalid site')
  }

  try {
    const user = await requireAdmin()
    const rows = await db
      .select({
        type: hubNotificationPreferences.type,
        enabled: hubNotificationPreferences.enabled,
      })
      .from(hubNotificationPreferences)
      .where(and(
        eq(hubNotificationPreferences.userId, user.id),
        eq(hubNotificationPreferences.siteId, siteId)
      ))

    const preferences = defaultPreferences()
    for (const row of rows) {
      if (isHubNotificationType(row.type)) {
        preferences[row.type] = row.enabled
      }
    }
    return preferences
  } catch (error) {
    console.error('Failed to list notification preferences:', error)
    throw new Error('Failed to load notification preferences')
  }
}

/** Write one switch for the signed-in admin. Only ever touches their own row. */
export async function updateNotificationPreferenceImpl(input: {
  siteId: string
  type: string
  enabled: boolean
}): Promise<{ type: HubNotificationType; enabled: boolean }> {
  if (!UUID_PATTERN.test(input.siteId)) {
    throw new Error('Invalid site')
  }
  if (!isHubNotificationType(input.type)) {
    throw new Error('Unknown notification kind')
  }
  if (typeof input.enabled !== 'boolean') {
    throw new Error('Invalid preference value')
  }

  try {
    const user = await requireAdmin()
    await db
      .insert(hubNotificationPreferences)
      .values({
        userId: user.id,
        siteId: input.siteId,
        type: input.type,
        enabled: input.enabled,
      })
      .onConflictDoUpdate({
        target: [
          hubNotificationPreferences.userId,
          hubNotificationPreferences.siteId,
          hubNotificationPreferences.type,
        ],
        set: {
          enabled: input.enabled,
          updatedAt: new Date(),
        },
      })

    return { type: input.type, enabled: input.enabled }
  } catch (error) {
    console.error('Failed to update notification preference:', error)
    throw new Error('Failed to save notification preference')
  }
}
