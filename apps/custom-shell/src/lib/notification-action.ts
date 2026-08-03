import {
  isAiLimitNotification,
  type NotificationItem,
} from "@/lib/api/notification"

/**
 * What clicking a notice should open. An announcement is the whole message
 * already, so it opens nothing — which is also why the tray does not close on
 * one: it would be shutting on the words the reader just clicked.
 */
export type NotificationAction =
  | { kind: "none" }
  | { kind: "changelog" }
  | { kind: "billing" }
  | { kind: "feedback"; feedbackId: string }

export function notificationAction(item: NotificationItem): NotificationAction {
  if (item.type === "announcement") return { kind: "none" }
  if (item.type === "changelog") return { kind: "changelog" }
  // The numbers behind an allowance warning live on the account window's
  // Billing tab, which opens by search param on whatever page is showing.
  if (isAiLimitNotification(item.type)) return { kind: "billing" }
  return item.feedback_id
    ? { kind: "feedback", feedbackId: item.feedback_id }
    : { kind: "none" }
}
