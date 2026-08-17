import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { DIRECTORY_DEFAULT_SORTS } from "@/lib/directory/public-search"
import { adminGet, adminPost } from "@/server/guards"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import {
  directorySettingsFor,
  saveDirectoryBadgesEnabled,
  saveDirectoryBrowseSettings,
  directoryGeocodingKeyStatus,
  directoryMapDisplayKeyStatus,
  saveDirectoryMapEnabled,
  type DirectorySettings,
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

export const getClearPublicPagesErrorMessage = createErrorMessage(
  {},
  "Cached public pages could not be cleared. Please try again."
)

const loadDirectorySettingsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => {
    const workspaceId = await workspaceIdForRequest(context.user.id)
    const [settings, geocodingKeyStatus, mapKeyStatus] = await Promise.all([
      directorySettingsFor(workspaceId),
      directoryGeocodingKeyStatus(workspaceId),
      directoryMapDisplayKeyStatus(workspaceId),
    ])
    return { ...settings, geocodingKeyStatus, mapKeyStatus }
  })

export function loadDirectorySettings() {
  return loadDirectorySettingsFn()
}

const clearPublicPagesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async ({ context }): Promise<{ cleared: number }> => {
    const site = await workspaceIdForRequest(context.user.id)
    return { cleared: clearPublicDirectoryCache(site) }
  })

/** Forget this site's short-lived public directory pages immediately. */
export function clearPublicPages() {
  return clearPublicPagesFn()
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

const saveMapEnabledFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ mapEnabled: z.boolean() }))
  .handler(async ({ data, context }) =>
    saveDirectoryMapEnabled(
      await workspaceIdForRequest(context.user.id),
      data.mapEnabled
    )
  )

/** Turns this site's browse-page map view on or off, and nothing else. */
export function saveMapEnabled(mapEnabled: boolean) {
  return saveMapEnabledFn({ data: { mapEnabled } })
}

const browseSettingsInput = z.object({
  pageSize: z.number(),
  defaultSort: z.enum(DIRECTORY_DEFAULT_SORTS),
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

export type { DirectorySettings }
