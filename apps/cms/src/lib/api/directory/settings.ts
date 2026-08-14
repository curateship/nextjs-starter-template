import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { DIRECTORY_SORTS } from "@/lib/directory/public-search"
import { adminGet, adminPost } from "@/server/guards"
import {
  directorySettingsFor,
  saveDirectoryBadgesEnabled,
  saveDirectoryBrowseSettings,
} from "@/server/directory/settings"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

export const getDirectorySettingsErrorMessage = createErrorMessage(
  {
    "Listings per page must be between 6 and 48.":
      "Listings per page must be between 6 and 48.",
    "Choose a listing order from the available options.":
      "Choose a listing order from the available options.",
    "Give the directory browse page a title.":
      "Give the directory browse page a title.",
  },
  "The directory settings could not be saved."
)

const loadDirectorySettingsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => {
    const settings = await directorySettingsFor(
      await workspaceIdForRequest(context.user.id)
    )
    return settings
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

const browseSettingsInput = z.object({
  pageSize: z.number(),
  defaultSort: z.enum(DIRECTORY_SORTS),
  browseTitle: z.string().max(120),
  browseIntro: z.string().max(500),
  featuredFirst: z.boolean(),
})

export type DirectoryBrowseSettingsInput = z.infer<typeof browseSettingsInput>

const saveBrowseSettingsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(browseSettingsInput)
  .handler(async ({ data, context }) =>
    saveDirectoryBrowseSettings(
      await workspaceIdForRequest(context.user.id),
      data
    )
  )

export function saveBrowseSettings(input: DirectoryBrowseSettingsInput) {
  return saveBrowseSettingsFn({ data: input })
}
