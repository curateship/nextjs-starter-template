import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import {
  directorySettingsFor,
  saveDirectoryBadgesEnabled,
} from "@/server/directory/settings"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

const loadDirectorySettingsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => {
    const settings = await directorySettingsFor(
      await workspaceIdForRequest(context.user.id)
    )
    return { badgesEnabled: settings.badgesEnabled }
  })

export function loadDirectorySettings() {
  return loadDirectorySettingsFn()
}

const saveBadgeSettingsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ badgesEnabled: z.boolean() }))
  .handler(async ({ data, context }) =>
    saveDirectoryBadgesEnabled(
      await workspaceIdForRequest(context.user.id),
      data.badgesEnabled
    )
  )

export function saveBadgeSettings(badgesEnabled: boolean) {
  return saveBadgeSettingsFn({ data: { badgesEnabled } })
}
