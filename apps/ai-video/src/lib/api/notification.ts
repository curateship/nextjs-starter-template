import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export type NotificationType =
  | "feedback_vote"
  | "feedback_comment"
  | "creator_watch"
  | "api_usage_alert"
  | "automation_approval"

export type NotificationItem = {
  id: string
  type: NotificationType
  actor_name: string
  recipient_name: string
  feedback_id: string | null
  feedback_message: string | null
  creator_id: string | null
  creator_username: string | null
  creator_display_name: string | null
  creator_new_video_count: number | null
  automation_run_id: string | null
  automation_id: string | null
  automation_name: string | null
  automation_approval_state: "pending" | "timed_out" | null
  api_usage_level: "warning" | "blocked" | null
  api_usage_period_start: string | null
  api_usage_used_credits: number | null
  api_usage_limit_credits: number | null
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

const notificationIdSchema = z.object({
  notificationId: z.string().min(1),
})

const deleteNotificationsSchema = z.object({
  notificationIds: z
    .array(z.string().min(1).max(100))
    .min(1)
    .max(500),
})

export function getNotificationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Notification request failed."
}

const listNotificationsPageFn = createServerFn({ method: "GET" })
  .inputValidator(listNotificationsSchema)
  .handler(async ({ data }): Promise<NotificationListResponse> => {
    const { listCurrentUserNotificationPage } = await import(
      "@/server/notifications"
    )
    return listCurrentUserNotificationPage(data)
  })

const listAllNotificationsFn = createServerFn({ method: "GET" })
  .inputValidator(listNotificationsSchema)
  .handler(async ({ data }): Promise<NotificationListResponse> => {
    const { listAdminNotificationPage } = await import("@/server/notifications")
    return listAdminNotificationPage(data)
  })

const markNotificationReadFn = createServerFn({ method: "POST" })
  .inputValidator(notificationIdSchema)
  .handler(
    async ({ data }): Promise<{ notificationId: string; readAt: string }> => {
      const { markCurrentUserNotificationRead } = await import(
        "@/server/notifications"
      )
      return markCurrentUserNotificationRead(data.notificationId)
    }
  )

const markAllNotificationsReadFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ notificationIds: string[]; readAt: string }> => {
    const { markAllCurrentUserNotificationsRead } = await import(
      "@/server/notifications"
    )
    return markAllCurrentUserNotificationsRead()
  }
)

const deleteAdminNotificationsFn = createServerFn({ method: "POST" })
  .inputValidator(deleteNotificationsSchema)
  .handler(async ({ data }): Promise<{ count: number }> => {
    const { deleteAdminNotificationRows } = await import(
      "@/server/notifications"
    )
    return deleteAdminNotificationRows(data.notificationIds)
  })

const clearAdminNotificationsFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ count: number }> => {
    const { clearAdminNotificationRows } = await import(
      "@/server/notifications"
    )
    return clearAdminNotificationRows()
  }
)

export function listNotificationPage(payload: NotificationListPayload = {}) {
  return listNotificationsPageFn({ data: payload })
}

export function listAllNotifications(payload: NotificationListPayload = {}) {
  return listAllNotificationsFn({ data: payload })
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
