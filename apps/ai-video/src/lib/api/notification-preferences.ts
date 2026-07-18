import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { NotificationType } from "@/lib/api/notification"

export type NotificationPreferenceMap = Record<NotificationType, boolean>

// One optional boolean per known type. Unknown keys are stripped by Zod, and
// omitted keys keep their stored value (merge happens server-side).
const savePreferencesSchema = z
  .object({
    feedback_vote: z.boolean().optional(),
    feedback_comment: z.boolean().optional(),
    creator_watch: z.boolean().optional(),
    api_usage_alert: z.boolean().optional(),
  })
  .strict()

export function getNotificationPreferenceErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Notification settings request failed."
}

const loadNotificationPreferencesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<NotificationPreferenceMap> => {
    const { getCurrentUserNotificationPreferences } = await import(
      "@/server/notification-preferences"
    )
    return getCurrentUserNotificationPreferences()
  }
)

const saveNotificationPreferencesFn = createServerFn({ method: "POST" })
  .inputValidator(savePreferencesSchema)
  .handler(async ({ data }): Promise<NotificationPreferenceMap> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const { saveCurrentUserNotificationPreferences } = await import(
      "@/server/notification-preferences"
    )
    return saveCurrentUserNotificationPreferences(data)
  })

export function loadNotificationPreferences() {
  return loadNotificationPreferencesFn()
}

export function saveNotificationPreferences(
  preferences: Partial<NotificationPreferenceMap>
) {
  return saveNotificationPreferencesFn({ data: preferences })
}
