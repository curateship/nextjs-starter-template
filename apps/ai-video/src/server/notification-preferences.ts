import { eq, inArray } from "drizzle-orm"

import { db, type AiVideoDb } from "@/server/db"
import { aiVideoUsers } from "@/server/schema"
import { now, requireUser } from "@/server/security"
import {
  isNotificationTypeAllowed,
  NOTIFICATION_PREFERENCE_TYPE_LIST,
  parseNotificationPreferences,
  resolveNotificationPreferenceMap,
  type NotificationPreferences,
} from "@/lib/notification-preferences"
import type { NotificationType } from "@/lib/api/notification"

// ---------------------------------------------------------------------------
// Per-user notification preferences: database access + the current-user
// settings surface. The pure decision logic (parse / allowed / resolve) and the
// type registry live in @/lib/notification-preferences (client-safe and unit
// tested there). This module wires that logic to the users table.
//
// Every bell notification type is checked against the recipient's preferences
// before the row is created (suppressed = never inserted, so existing rows are
// untouched). Preferences live in the `notification_preferences` jsonb on the
// user row as { [NotificationType]: boolean }. A missing key means "on", so new
// users and users who never opened settings keep receiving everything.
// ---------------------------------------------------------------------------

// `database` is a `Pick` of the methods used (not the full `AiVideoDb`) so a
// transaction handle passes cleanly at the feedback insert sites — a
// transaction lacks `$client` and would not satisfy `AiVideoDb`.
export async function getUserNotificationPreferences(
  userId: string,
  database: Pick<AiVideoDb, "select"> = db
): Promise<NotificationPreferences> {
  const [row] = await database
    .select({ preferences: aiVideoUsers.notificationPreferences })
    .from(aiVideoUsers)
    .where(eq(aiVideoUsers.id, userId))
    .limit(1)
  return parseNotificationPreferences(row?.preferences)
}

// Single-recipient guard used at the feedback and creator-watch insert sites.
// Short-circuits the always-on case before touching the database.
export async function shouldDeliverNotification(
  {
    recipientUserId,
    type,
    apiUsageLevel,
  }: {
    recipientUserId: string
    type: NotificationType
    apiUsageLevel?: "warning" | "blocked" | null
  },
  database: Pick<AiVideoDb, "select"> = db
): Promise<boolean> {
  if (type === "api_usage_alert" && apiUsageLevel === "blocked") {
    return true
  }
  const preferences = await getUserNotificationPreferences(
    recipientUserId,
    database
  )
  return isNotificationTypeAllowed(preferences, type, { apiUsageLevel })
}

// Fan-out guard: keeps only the recipients whose preferences allow this type.
// Used by the api-usage alert, which writes one row per admin plus the user.
// Loads every recipient's preferences in a single query.
export async function filterNotificationRecipients(
  recipientUserIds: string[],
  type: NotificationType,
  options: { apiUsageLevel?: "warning" | "blocked" | null },
  database: Pick<AiVideoDb, "select"> = db
): Promise<string[]> {
  if (recipientUserIds.length === 0) {
    return []
  }
  if (type === "api_usage_alert" && options.apiUsageLevel === "blocked") {
    return recipientUserIds
  }

  const rows = await database
    .select({
      id: aiVideoUsers.id,
      preferences: aiVideoUsers.notificationPreferences,
    })
    .from(aiVideoUsers)
    .where(inArray(aiVideoUsers.id, recipientUserIds))

  const preferencesById = new Map(
    rows.map((row) => [row.id, parseNotificationPreferences(row.preferences)])
  )
  return recipientUserIds.filter((id) =>
    isNotificationTypeAllowed(preferencesById.get(id) ?? {}, type, options)
  )
}

// ---------------------------------------------------------------------------
// Current-user settings surface (per-user, not admin-gated — every recipient
// manages their own toggles). Backs the Notifications tab in Settings.
// ---------------------------------------------------------------------------

export async function getCurrentUserNotificationPreferences(): Promise<
  Record<NotificationType, boolean>
> {
  const user = await requireUser()
  return resolveNotificationPreferenceMap(
    parseNotificationPreferences(user.notificationPreferences)
  )
}

export async function saveCurrentUserNotificationPreferences(
  input: Partial<Record<NotificationType, boolean>>
): Promise<Record<NotificationType, boolean>> {
  const user = await requireUser()

  // Merge onto the current values so an unknown/omitted key keeps its state,
  // then store the normalized full map (only known types, all booleans).
  const current = parseNotificationPreferences(user.notificationPreferences)
  const next: NotificationPreferences = {}
  for (const type of NOTIFICATION_PREFERENCE_TYPE_LIST) {
    const value = input[type]
    next[type] = typeof value === "boolean" ? value : current[type] !== false
  }

  await db
    .update(aiVideoUsers)
    .set({ notificationPreferences: next, updatedAt: now() })
    .where(eq(aiVideoUsers.id, user.id))

  return resolveNotificationPreferenceMap(next)
}
