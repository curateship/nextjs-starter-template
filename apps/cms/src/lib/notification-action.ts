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
  | {
      kind: "automationRun"
      automationId: string
      runId: string
      nodeId?: string
    }

/**
 * Any origin will do. The question is whether a *relative* address stays on
 * whatever site it is resolved against, and an address that escapes escapes
 * from every origin alike. A fixed one is used rather than the page's, because
 * this runs on the server too, where there is no page.
 */
const ANY_SITE = "http://own-app.invalid"

/**
 * Whether an address the app handed back is one this app can be sent to.
 *
 * These strings come out of a database, so they are checked rather than
 * trusted. Two things have to hold: it starts with a slash, so it is an
 * address in this app rather than `javascript:`, another site, or a path read
 * relative to whatever page happens to be open; and once resolved it is still
 * on the site it was resolved against.
 *
 * **The second test is the one that matters, and reading the text cannot
 * replace it.** A browser treats a backslash as a slash, so `/\evil.example`
 * is `//evil.example` wearing a disguise — one leading slash by eye, another
 * site in fact. Resolving the address and comparing the site it lands on
 * catches that, and catches the next disguise nobody has thought of yet.
 */
export function isOwnAppHref(href: string): boolean {
  if (!href.startsWith("/")) return false
  try {
    return new URL(href, ANY_SITE).origin === ANY_SITE
  } catch {
    // An address the browser cannot even read is not one to follow.
    return false
  }
}

export function notificationAction(item: NotificationItem): NotificationAction {
  if (item.type === "announcement") return { kind: "none" }
  if (item.type === "changelog") return { kind: "changelog" }
  // The buttons live in the flow's own editor, in the panel under the canvas,
  // so the notice opens the run there rather than repeating what it says.
  if (
    item.type === "automation_approval" ||
    item.type === "automation_failed"
  ) {
    return item.automation_run_id && item.automation_id
      ? {
          kind: "automationRun",
          automationId: item.automation_id,
          runId: item.automation_run_id,
          ...(item.automation_failure_node_id
            ? { nodeId: item.automation_failure_node_id }
            : {}),
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
