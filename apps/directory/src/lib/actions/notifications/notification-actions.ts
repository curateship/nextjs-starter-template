import { createServerFn } from "@tanstack/react-start"
import {
  listHubNotificationPageImpl,
  listHubNotificationsForUserImpl,
  markAllHubNotificationsReadForUserImpl,
  markAllHubNotificationsReadImpl,
  markHubNotificationReadImpl,
} from "./notification-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./notification-actions.server"

export const listHubNotificationPage = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; cursor?: string | null; limit?: number | null }) => data)
  .handler(async ({ data }) => listHubNotificationPageImpl(data))

export const listHubNotificationsForUser = createServerFn({ method: "POST" })
  .inputValidator((data: { limit?: number | null }) => data)
  .handler(async ({ data }) => listHubNotificationsForUserImpl(data))

export const markAllHubNotificationsReadForUser = createServerFn({ method: "POST" })
  .handler(async () => markAllHubNotificationsReadForUserImpl())

export const markHubNotificationRead = createServerFn({ method: "POST" })
  .inputValidator((data: { notificationId: string; siteId: string }) => data)
  .handler(async ({ data }) => markHubNotificationReadImpl(data.notificationId, data.siteId))

export const markAllHubNotificationsRead = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => markAllHubNotificationsReadImpl(data.siteId))
