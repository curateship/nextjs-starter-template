import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export type NotificationType =
  | "feedback_vote"
  | "feedback_comment"
  | "feedback_merged"
  | "changelog"
  | "announcement"

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
}

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
  type: z
    .enum([
      "all",
      "feedback_vote",
      "feedback_comment",
      "feedback_merged",
      "changelog",
      "announcement",
    ])
    .default("all"),
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

const listAdminNotificationsFn = createServerFn({ method: "GET" })
  .inputValidator(adminListQuerySchema)
  .handler(async ({ data }) => {
    const { listAdminNotifications, requireAdminNotificationUser } =
      await import("@/server/notifications")
    await requireAdminNotificationUser()
    return listAdminNotifications(data)
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
    const { listAdminNotifications, requireAdminNotificationUser } =
      await import("@/server/notifications")
    const { readDashboardRowsPerPage } = await import("@/server/shell-settings")

    await requireAdminNotificationUser()
    const pageSize = await readDashboardRowsPerPage()

    return { ...(await listAdminNotifications({ ...data, pageSize })), pageSize }
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

export function listAdminNotifications(query: AdminNotificationQueryInput) {
  return listAdminNotificationsFn({ data: query })
}

export function loadAdminNotificationsPage(
  query: Omit<AdminNotificationQueryInput, "pageSize">
) {
  return loadAdminNotificationsPageFn({ data: query })
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
