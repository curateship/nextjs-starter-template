/**
 * What kinds of notice the app can send, and every word that goes with one.
 *
 * Pure data with nothing behind it, in its own file because both sides need it:
 * the server writes these words into its queries and the browser draws them.
 * Left in `lib/api/notification.ts` it was a circle — that module reaches into
 * `server/notifications/inbox.ts`, which reaches straight back — and a circle
 * hands out `undefined` to whichever side of it loads first.
 */

export type NotificationType =
  | "feedback_vote"
  | "feedback_comment"
  | "feedback_merged"
  | "changelog"
  | "announcement"
  | "ai_limit_warning"
  | "ai_limit_reached"
  | "automation_approval"
  | "automation_failed"
  | "account_update"
  | "system_email_failed"

export const NOTIFICATION_TYPES = [
  "feedback_vote",
  "feedback_comment",
  "feedback_merged",
  "changelog",
  "announcement",
  "ai_limit_warning",
  "ai_limit_reached",
  "automation_approval",
  "automation_failed",
  "account_update",
  "system_email_failed",
] as const satisfies readonly NotificationType[]

export type NotificationTypeVisibility = Record<NotificationType, boolean>

export function createDefaultNotificationTypeVisibility(): NotificationTypeVisibility {
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, true])
  ) as NotificationTypeVisibility
}

export function normalizeNotificationTypeVisibility(
  value: unknown
): NotificationTypeVisibility {
  const saved =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<NotificationTypeVisibility>)
      : {}

  return Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [type, saved[type] !== false])
  ) as NotificationTypeVisibility
}

export function visibleNotificationTypes(
  visibility: NotificationTypeVisibility
): NotificationType[] {
  return NOTIFICATION_TYPES.filter((type) => visibility[type])
}

/**
 * What each kind of notice is called on screen. Kept here rather than in the
 * table because the server sorts the Type column by these words too — sorting
 * by the stored value would put "Announcement, Update, Comment, Thumbs up" in
 * that order and look random.
 */
export const notificationTypeLabels: Record<NotificationType, string> = {
  feedback_vote: "Thumbs up",
  feedback_comment: "Comment",
  feedback_merged: "Merged",
  changelog: "Update",
  announcement: "Announcement",
  ai_limit_warning: "AI warning",
  ai_limit_reached: "AI limit reached",
  automation_approval: "Approval",
  automation_failed: "Automation failed",
  account_update: "Account update",
  system_email_failed: "Email failed",
}

/**
 * The two things an approval notice can be about. They are about the same run,
 * so without this the second would read exactly like the first.
 */
export type AutomationApprovalState = "pending" | "timed_out"

/**
 * The words an approval notice carries. Like an announcement, the notice is the
 * message — the run it points at is where the buttons are, not the words.
 */
export const automationApprovalNotificationText: Record<
  AutomationApprovalState,
  { message: string; detail: string }
> = {
  pending: {
    message: "A run is waiting for your approval",
    detail:
      "Nothing after that step happens until you approve it. If nobody answers before the deadline, the run stops on its own.",
  },
  timed_out: {
    message: "A run stopped because nobody approved it in time",
    detail:
      "The deadline passed with no answer, so the run was rejected and nothing after that step ran.",
  },
}

export type AiLimitNotificationType = "ai_limit_warning" | "ai_limit_reached"

export function isAiLimitNotification(
  type: NotificationType
): type is AiLimitNotificationType {
  return type === "ai_limit_warning" || type === "ai_limit_reached"
}

/**
 * The words an AI-allowance notice carries. It is about the reader's own
 * account rather than a thing with a page, so — like an announcement — the
 * notice IS the message, and every place that shows one (the tray, the admin
 * table, the activity card) reads the same words from here.
 */
export const aiLimitNotificationText: Record<
  AiLimitNotificationType,
  { message: string; detail: string }
> = {
  ai_limit_warning: {
    message: "Your AI allowance is almost used up",
    detail:
      "You've passed 80% of this month's AI allowance. AI features pause when it runs out, and start fresh on the 1st.",
  },
  ai_limit_reached: {
    message: "Your AI allowance is used up",
    detail:
      "AI features are paused until the 1st, when next month's allowance starts.",
  },
}
