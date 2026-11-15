import { createServerFn } from "@tanstack/react-start"
import {
  listCurrentUserNotificationPage,
  countUnreadNotifications as countUnreadNotificationRows,
  countUnseenNotifications as countUnseenNotificationRows,
  markCurrentUserNotificationsSeen,
  markCurrentUserNotificationRead,
  markAllCurrentUserNotificationsRead,
} from "@/server/notifications/inbox"
import { userGet } from "@/server/guards"
import { readShellGlobals } from "@/server/shell-settings"
// The words and the kinds live apart from this module on purpose: it reaches
// into `server/notifications/inbox.ts`, which reaches back, and a circle hands
// out `undefined` to whichever side loads first. See `lib/notification-types`.
import {
  type AutomationApprovalState,
  type NotificationType,
} from "@/lib/notification-types"
import { z } from "zod"

import { createErrorMessage } from "./error-message"

export type NotificationItem = {
  id: string
  type: NotificationType
  /**
   * Null on a notice the product posts itself, such as an announcement, rather
   * than a person acting on your feedback.
   */
  actor_name: string | null
  /** The actor's profile photo, when they have one. Null with no actor. */
  actor_avatar_url: string | null
  recipient_name: string
  /** Both null unless the notice is about a piece of feedback. */
  feedback_id: string | null
  feedback_message: string | null
  /**
   * All three null unless the notice is an announcement. It carries its own
   * words because there is no announcement page to open — the notice is the
   * whole message, so somebody who dismissed the banner can still read it here.
   */
  announcement_id: string | null
  announcement_title: string | null
  announcement_body: string | null
  /**
   * Null unless the notice is about an automation run. The notice opens the run
   * inside its own flow's editor, so it carries both ids and the flow name.
   */
  automation_run_id: string | null
  automation_id: string | null
  automation_name: string | null
  /** The checkpoint's own sentence saying what approval will do. */
  automation_approval_summary: string | null
  automation_approval_state: AutomationApprovalState | null
  /** Filled only for a failed-run alert. */
  automation_failure_node_id: string | null
  automation_failure_node_name: string | null
  automation_failure_error: string | null
  /**
   * Null unless the notice is a follow-up: the conversation with the lead
   * whose chase date came round, so clicking the notice opens it in the CRM.
   */
  crm_thread_id: string | null
  /** Filled when an admin changed this person's own account. */
  message: string | null
  detail: string | null
  read_at: string | null
  created_at: string
}

type NotificationListResponse = {
  notifications: NotificationItem[]
  next_cursor: string | null
  /** Notices not yet clicked. This is the Unread tab's number. */
  unread_count: number
  /** Notices that arrived since the bell was last opened. The red number. */
  unseen_count: number
}

type NotificationListPayload = {
  cursor?: string
  limit?: number
}

const MAX_PAGE_SIZE = 50

const listNotificationsSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
})

const notificationIdSchema = z.object({
  notificationId: z.string().min(1),
})

/**
 * The inbox throws its own phrases rather than the guards' codes, so they are
 * named here. Before this, "Missing Custom Shell session" reached the toast
 * word for word.
 */
export const getNotificationErrorMessage = createErrorMessage(
  {
    "Missing Custom Shell session": "Please sign in again.",
    "Notification not found": "That notification is no longer there.",
    "Invalid notification cursor":
      "We could not load more notifications. Please refresh and try again.",
  },
  "Notification request failed."
)

const listNotificationsPageFn = createServerFn({ method: "GET" })
  .inputValidator(listNotificationsSchema)
  .handler(async ({ data }): Promise<NotificationListResponse> => {
    return listCurrentUserNotificationPage(data)
  })

/**
 * The two numbers on their own — what a live nudge (and the slow fallback
 * check) asks for while the tray is shut. There is no point pulling a list
 * nobody is looking at.
 *
 * Two, because the bell and the Unread tab count different things: the bell
 * counts what arrived since it was last opened, the tab counts what has not
 * been clicked.
 */
const countUnreadNotificationsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(
    async ({
      context,
    }): Promise<{ unread_count: number; unseen_count: number }> => {
      // The guard has already found the account, so this asks the database two
      // questions, not four. It runs once a minute per open tab.
      const { notificationTypes } = await readShellGlobals()
      const [unread_count, unseen_count] = await Promise.all([
        countUnreadNotificationRows(
          context.user.id,
          undefined,
          notificationTypes
        ),
        countUnseenNotificationRows(
          context.user.id,
          undefined,
          notificationTypes
        ),
      ])
      return { unread_count, unseen_count }
    }
  )

/**
 * Opening the bell. It clears the red number and leaves every notice unread.
 */
const markNotificationsSeenFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ seenCount: number; seenAt: string }> => {
    return markCurrentUserNotificationsSeen()
  }
)

const markNotificationReadFn = createServerFn({ method: "POST" })
  .inputValidator(notificationIdSchema)
  .handler(
    async ({ data }): Promise<{ notificationId: string; readAt: string }> => {
      return markCurrentUserNotificationRead(data.notificationId)
    }
  )

const markAllNotificationsReadFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ notificationIds: string[]; readAt: string }> => {
    return markAllCurrentUserNotificationsRead()
  }
)

export function listNotificationPage(payload: NotificationListPayload = {}) {
  return listNotificationsPageFn({ data: payload })
}

/** Both numbers, despite the name. See the handler above. */
export function countUnreadNotifications() {
  return countUnreadNotificationsFn()
}

export function markNotificationsSeen() {
  return markNotificationsSeenFn()
}

export function markNotificationRead(notificationId: string) {
  return markNotificationReadFn({ data: { notificationId } })
}

export function markAllNotificationsRead() {
  return markAllNotificationsReadFn()
}
