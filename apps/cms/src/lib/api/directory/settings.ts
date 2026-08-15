import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { DIRECTORY_FRONT_PAGE_MODES } from "@/lib/directory/front-page"
import { DIRECTORY_DEFAULT_SORTS } from "@/lib/directory/public-search"
import { adminGet, adminPost } from "@/server/guards"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import {
  directorySettingsFor,
  saveDirectoryBadgesEnabled,
  saveDirectoryBrowseSettings,
  saveDirectoryFrontPageSettings,
  directoryGeocodingKeyStatus,
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
    "Choose what the front page should show.":
      "Choose what the front page should show.",
    "Front page listings must be between 1 and 12.":
      "Front page listings must be between 1 and 12.",
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
    const [settings, geocodingKeyStatus] = await Promise.all([
      directorySettingsFor(workspaceId),
      directoryGeocodingKeyStatus(workspaceId),
    ])
    return { ...settings, geocodingKeyStatus }
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

const frontPageSettingsInput = z.object({
  frontPageMode: z.enum(DIRECTORY_FRONT_PAGE_MODES),
  frontPageCount: z.number(),
})

export type DirectoryFrontPageSettingsInput = z.infer<
  typeof frontPageSettingsInput
>

const saveFrontPageSettingsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(frontPageSettingsInput)
  .handler(async ({ data, context }) =>
    saveDirectoryFrontPageSettings(
      await workspaceIdForRequest(context.user.id),
      data
    )
  )

export function saveFrontPageSettings(input: DirectoryFrontPageSettingsInput) {
  return saveFrontPageSettingsFn({ data: input })
}

export type { DirectorySettings }
