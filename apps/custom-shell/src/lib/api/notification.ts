import { createServerFn } from "@tanstack/react-start"
import {
  listCurrentUserNotificationPage,
  listAdminNotifications as listAdminNotificationRows,
  requireAdminNotificationUser,
  countUnreadNotifications as countUnreadNotificationRows,
  markCurrentUserNotificationRead,
  markAllCurrentUserNotificationsRead,
  deleteAdminNotificationRows,
  clearAdminNotificationRows,
} from "@/server/notifications/inbox"
import { userGet } from "@/server/guards"
import { readShellGlobals } from "@/server/shell-settings"
// The words and the kinds live apart from this module on purpose: it reaches
// into `server/notifications/inbox.ts`, which reaches back, and a circle hands
// out `undefined` to whichever side loads first. See `lib/notification-types`.
import {
  NOTIFICATION_TYPES,
  type AutomationApprovalState,
  type NotificationType,
} from "@/lib/notification-types"
import { readDashboardRowsPerPage } from "@/server/shell-settings"
import { z } from "zod"

export type NotificationItem = {
  id: string
  type: NotificationType
  /**
   * Null on a changelog or announcement notice: both are posted by the product,
   * not by a person acting on your feedback.
   */
  actor_name: string | null
  /** The actor's profile photo, when they have one. Null with no actor. */
  actor_avatar_url: string | null
  recipient_name: string
  /** Both null unless the notice is about a piece of feedback. */
  feedback_id: string | null
  feedback_message: string | null
  /** Both null unless the notice is about a published update. */
  changelog_entry_id: string | null
  changelog_title: string | null
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
  /** Filled when an admin changed this person's own account. */
  message: string | null
  detail: string | null
  read_at: string | null
  created_at: string
}

type NotificationListResponse = {
  notifications: NotificationItem[]
  next_cursor: string | null
  unread_count: number
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

const adminListQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  read: z.enum(["all", "unread", "read"]).default("all"),
  type: z.enum(["all", ...NOTIFICATION_TYPES]).default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  sort: z
    .enum(["activity", "feedback", "recipient", "type", "status", "created"])
    .default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
})

export type AdminNotificationQueryInput = z.input<typeof adminListQuerySchema>

const notificationIdSchema = z.object({
  notificationId: z.string().min(1),
})

const deleteNotificationsSchema = z.object({
  notificationIds: z.array(z.string().min(1).max(100)).min(1).max(500),
})

export function getNotificationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Notification request failed."
}

const listNotificationsPageFn = createServerFn({ method: "GET" })
  .inputValidator(listNotificationsSchema)
  .handler(async ({ data }): Promise<NotificationListResponse> => {
    return listCurrentUserNotificationPage(data)
  })

const listAdminNotificationsFn = createServerFn({ method: "GET" })
  .inputValidator(adminListQuerySchema)
  .handler(async ({ data }) => {
    await requireAdminNotificationUser()
    return listAdminNotificationRows(data)
  })

/**
 * The admin page's first request, done on the server.
 *
 * Like the Users page, the page size is not passed in: the configured
 * rows-per-page is read here and sent back with the rows, so the table and the
 * footer's "1-10 of N" cannot disagree on first paint.
 */
const loadAdminNotificationsPageFn = createServerFn({ method: "GET" })
  .inputValidator(adminListQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    await requireAdminNotificationUser()
    const pageSize = await readDashboardRowsPerPage()

    return {
      ...(await listAdminNotificationRows({ ...data, pageSize })),
      pageSize,
    }
  })

/**
 * The bell's number on its own — what a live nudge (and the slow fallback
 * check) asks for while the tray is shut. There is no point pulling a list
 * nobody is looking at.
 */
const countUnreadNotificationsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ unread_count: number }> => {
    // The guard has already found the account, so this asks the database one
    // question, not three. It runs once a minute per open tab.
    const { notificationTypes } = await readShellGlobals()
    return {
      unread_count: await countUnreadNotificationRows(
        context.user.id,
        undefined,
        notificationTypes
      ),
    }
  })

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

const deleteAdminNotificationsFn = createServerFn({ method: "POST" })
  .inputValidator(deleteNotificationsSchema)
  .handler(async ({ data }): Promise<{ count: number }> => {
    return deleteAdminNotificationRows(data.notificationIds)
  })

const clearAdminNotificationsFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ count: number }> => {
    return clearAdminNotificationRows()
  }
)

export function listNotificationPage(payload: NotificationListPayload = {}) {
  return listNotificationsPageFn({ data: payload })
}

export function listAdminNotifications(query: AdminNotificationQueryInput) {
  return listAdminNotificationsFn({ data: query })
}

export function loadAdminNotificationsPage(
  query: Omit<AdminNotificationQueryInput, "pageSize">
) {
  return loadAdminNotificationsPageFn({ data: query })
}

export function countUnreadNotifications() {
  return countUnreadNotificationsFn()
}

export function markNotificationRead(notificationId: string) {
  return markNotificationReadFn({ data: { notificationId } })
}

export function markAllNotificationsRead() {
  return markAllNotificationsReadFn()
}

export function deleteAdminNotifications(notificationIds: string[]) {
  return deleteAdminNotificationsFn({ data: { notificationIds } })
}

export function clearAdminNotifications() {
  return clearAdminNotificationsFn()
}
