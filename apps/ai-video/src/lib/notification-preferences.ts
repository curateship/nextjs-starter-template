import type { NotificationType } from "@/lib/api/notification"

// Client-safe registry of bell notification types shown in Settings. This is
// the single source of truth for which types have a preference toggle; both the
// server guard (@/server/notification-preferences) and the settings UI read it.
//
// IMPORTANT: when a new NotificationType is added (see @/lib/api/notification),
// add a matching entry here — otherwise it gets no toggle and cannot be
// suppressed. Order here is the display order in Settings.

export type NotificationPreferenceMeta = {
  type: NotificationType
  label: string
  // Plain-English description of what fires this notification.
  description: string
  // Extra line shown under types with a non-suppressible safety carve-out.
  note?: string
}

export const NOTIFICATION_PREFERENCE_TYPES: readonly NotificationPreferenceMeta[] =
  [
    {
      type: "creator_watch",
      label: "Watched creators post",
      description:
        "A creator you watch published new videos and they were added to your archive.",
    },
    {
      type: "automation_approval",
      label: "Automation approvals",
      description:
        "An automation paused at an approval checkpoint and is waiting for your decision.",
      note: "Turning this off does not skip the checkpoint — the run still waits in the Automations runs panel.",
    },
    {
      type: "feedback_comment",
      label: "Comments on your feedback",
      description: "Someone replied to feedback you submitted.",
    },
    {
      type: "feedback_vote",
      label: "Votes on your feedback",
      description: "Someone gave a thumbs up to feedback you submitted.",
    },
    {
      type: "api_usage_alert",
      label: "Usage warnings",
      description: "You are approaching your monthly usage limit.",
      note: "Critical alerts that fire when you are fully blocked always arrive.",
    },
  ] as const

export const NOTIFICATION_PREFERENCE_TYPE_LIST: readonly NotificationType[] =
  NOTIFICATION_PREFERENCE_TYPES.map((entry) => entry.type)

const PREFERENCE_TYPE_SET = new Set<NotificationType>(
  NOTIFICATION_PREFERENCE_TYPE_LIST
)

// A partial map — missing key means "use the default" (on).
export type NotificationPreferences = Partial<Record<NotificationType, boolean>>

// Normalizes a stored jsonb value into a preferences object, keeping only known
// boolean toggles. Anything unexpected is dropped so a malformed row degrades
// to "everything on" rather than throwing.
export function parseNotificationPreferences(
  value: unknown
): NotificationPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  const source = value as Record<string, unknown>
  const preferences: NotificationPreferences = {}
  for (const type of PREFERENCE_TYPE_SET) {
    const entry = source[type]
    if (typeof entry === "boolean") {
      preferences[type] = entry
    }
  }
  return preferences
}

// The single decision point: may a notification of this type be delivered to a
// user with these preferences? A type is suppressed only when it is explicitly
// set to false. The "blocked" usage alert is a safety notice and always sends
// regardless of preferences.
export function isNotificationTypeAllowed(
  preferences: NotificationPreferences,
  type: NotificationType,
  options?: { apiUsageLevel?: "warning" | "blocked" | null }
): boolean {
  if (type === "api_usage_alert" && options?.apiUsageLevel === "blocked") {
    return true
  }
  return preferences[type] !== false
}

// Full on/off map for the settings UI: every known type resolved to its
// effective value, filling defaults (on) for keys the user never set.
export function resolveNotificationPreferenceMap(
  preferences: NotificationPreferences
): Record<NotificationType, boolean> {
  const map = {} as Record<NotificationType, boolean>
  for (const type of NOTIFICATION_PREFERENCE_TYPE_LIST) {
    map[type] = preferences[type] !== false
  }
  return map
}
