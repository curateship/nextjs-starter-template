import { createServerFn } from "@tanstack/react-start"
import {
  listNotificationPreferencesImpl,
  updateNotificationPreferenceImpl,
} from "./notification-preference-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./notification-preference-actions.server"

export const listNotificationPreferences = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => listNotificationPreferencesImpl(data.siteId))

export const updateNotificationPreference = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; type: string; enabled: boolean }) => data)
  .handler(async ({ data }) => updateNotificationPreferenceImpl(data))
