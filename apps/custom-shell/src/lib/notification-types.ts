/**
 * What kinds of notice the app can send, and every word that goes with one.
 *
 * Pure data with nothing behind it, in its own file because both sides need it:
 * the server writes these words into its queries and the browser draws them.
 * Left in `lib/api/notification.ts` it was a circle — that module reaches into
 * `server/notifications/inbox.ts`, which reaches straight back — and a circle
 * hands out `undefined` to whichever side of it loads first.
 */

/**
 * `app_activity` is the notice an app writes about the reader's own doing —
 * a trade that filled, a price that crossed a line. It carries its own words in
 * `message` and `detail` and belongs to one person, so it needs nothing else in
 * the database behind it.
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
  | "app_activity"
  | "crm_follow_up"

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
  "app_activity",
  "crm_follow_up",
] as const satisfies readonly NotificationType[]

/**
 * The notices that carry their own words in `message` and `detail`, written
 * when the notice was sent. Every other kind borrows its words from the thing
 * it points at: a feedback post, an update, a flow.
 *
 * One list, read by the bell, the Notifications table and the table's search.
 * `crm_follow_up` was added to the types on 3 Oct 2026 but not to the three
 * hand-written copies of this list, so every follow-up reminder fell through
 * to the feedback wording and read "Somebody commented on your feedback".
 */
export const SELF_WORDED_NOTIFICATION_TYPES = [
  "account_update",
  "system_email_failed",
  "app_activity",
  "crm_follow_up",
] as const satisfies readonly NotificationType[]

export function carriesItsOwnWords(type: NotificationType) {
  return (SELF_WORDED_NOTIFICATION_TYPES as readonly NotificationType[]).includes(
    type
  )
}

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
  app_activity: "Activity",
  crm_follow_up: "Follow up",
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

/**
 * The words a follow-up notice carries.
 *
 * The notice IS the message, like an announcement: the lead's own name and the
 * note typed with the date go in `detail`, and the conversation it points at is
 * where the work happens.
 */
export function crmFollowUpNotificationText(
  who: string,
  note: string | null
): { message: string; detail: string } {
  return {
    message: `Follow up with ${who}`,
    detail: note?.trim()
      ? note.trim()
      : "You set a date to chase this one, and the date has passed.",
  }
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
