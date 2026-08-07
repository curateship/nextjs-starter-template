import {
  type NotificationItem,
} from "@/lib/api/notification"
import {
  isAiLimitNotification,
} from "@/lib/notification-types"

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
  | { kind: "automationRun"; automationId: string; runId: string }

export function notificationAction(item: NotificationItem): NotificationAction {
  if (item.type === "announcement") return { kind: "none" }
  if (item.type === "changelog") return { kind: "changelog" }
  // The buttons live in the flow's own editor, in the panel under the canvas,
  // so the notice opens the run there rather than repeating what it says.
  if (item.type === "automation_approval") {
    return item.automation_run_id && item.automation_id
      ? {
          kind: "automationRun",
          automationId: item.automation_id,
          runId: item.automation_run_id,
        }
      : { kind: "none" }
  }
  // The numbers behind an allowance warning live on the account window's
  // Billing tab, which opens by search param on whatever page is showing.
  if (isAiLimitNotification(item.type)) return { kind: "billing" }
  return item.feedback_id
    ? { kind: "feedback", feedbackId: item.feedback_id }
    : { kind: "none" }
}
