import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  HANDLE_MAX,
  LINKS_MAX,
  REPORT_REASON_MAX,
  type LeaderboardRow,
  type MyPublicProfile,
  type PublicProfileView,
} from "@/lib/trade/public-profile/profile"
import { appUrlFor } from "@/server/app-url"
import { requestIp, requireAppOrigin } from "@/server/auth/origin"
import { adminGet, adminPost, userGet, userPost } from "@/server/guards"
import {
  checkMyWallets,
  listProfilesForAdmin,
  loadLeaderboard,
  loadMyPublicProfile,
  loadPublicProfileView,
  reportPublicProfile,
  saveMyPublicProfile,
  setProfileHidden,
  switchMyPublicProfile,
  type AdminProfileRow,
} from "@/server/trade/public-profiles"
import type { OwnershipCheck } from "@/server/trade/trade-record"

import { createErrorMessage } from "../error-message"
import { getWalletErrorMessage } from "./wallets"

export type { AdminProfileRow, OwnershipCheck }

/**
 * Public trader profiles. The member's own settings and the admin's hide
 * switch take the ordinary guards. The page, the leaderboard and the Report
 * form are open to anybody, which is the feature: a visitor from X has no
 * account. Those three are written down in `src/app/open-endpoints.ts`.
 */

const baseMessage = createErrorMessage(
  {
    PROFILE_HANDLE_TAKEN: "Somebody else has that handle. Pick another.",
    PROFILE_HANDLE_HELD:
      "That handle was given up by somebody else in the last 90 days, so it is held for them. Pick another.",
    PROFILE_NOT_SAVED: "Save the profile before switching it on.",
    PROFILE_NOT_FOUND: "That profile is not public.",
    PROFILE_HIDE_REASON_REQUIRED:
      "Write the reason the member will read before hiding the profile.",
    REPORT_REASON_REQUIRED: "Say what is wrong before sending.",
    REPORT_REASON_LONG: `Keep the report under ${REPORT_REASON_MAX} characters.`,
    RATE_LIMITED:
      "That is a lot of reports from one place. Try again in an hour.",
  },
  "That did not work. Try it again."
)

export function getPublicProfileErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "")
  const typed = /^PROFILE_INPUT:([^]+)/.exec(message)
  return typed ? typed[1] : baseMessage(error)
}

const profileSchema = z.object({
  handle: z.string().max(HANDLE_MAX + 1),
  displayName: z.string().max(DISPLAY_NAME_MAX * 2),
  picture: z.string().max(2_000).nullable(),
  bio: z.string().max(BIO_MAX * 2),
  links: z.array(z.string().max(500)).max(LINKS_MAX),
  searchable: z.boolean(),
})

const loadMyPublicProfileFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }): Promise<MyPublicProfile> =>
    loadMyPublicProfile(context.user.id)
  )

const saveMyPublicProfileFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(profileSchema)
  .handler(async ({ data, context }) => {
    await saveMyPublicProfile(context.user.id, data)
    return { saved: true }
  })

const switchMyPublicProfileFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ on: z.boolean() }))
  .handler(({ data, context }): Promise<OwnershipCheck[]> =>
    switchMyPublicProfile(context.user.id, data.on, getWalletErrorMessage)
  )

const checkMyWalletsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(({ context }): Promise<OwnershipCheck[]> =>
    checkMyWallets(context.user.id, getWalletErrorMessage)
  )

const handleSchema = z.object({
  handle: z
    .string()
    .min(1)
    .max(HANDLE_MAX + 1),
})

export type PublicProfilePage = {
  view: PublicProfileView
  /** Absolute addresses, because X and Telegram need them whole. */
  pageUrl: string
  shareImageUrl: string
}

const readPublicProfileFn = createServerFn({ method: "GET" })
  .inputValidator(handleSchema)
  .handler(async ({ data }): Promise<PublicProfilePage | null> => {
    const view = await loadPublicProfileView(data.handle)
    if (!view) return null
    return {
      view,
      pageUrl: appUrlFor(`/t/${view.handle}`),
      shareImageUrl: appUrlFor(`/t/share-image/${view.handle}`),
    }
  })

const readLeaderboardFn = createServerFn({ method: "GET" }).handler(
  (): Promise<LeaderboardRow[]> => loadLeaderboard()
)

const reportPublicProfileFn = createServerFn({ method: "POST" })
  .inputValidator(
    handleSchema.extend({ reason: z.string().max(REPORT_REASON_MAX * 2) })
  )
  .handler(async ({ data }) => {
    // Guarded by hand: anybody may report, but only from this app's pages.
    requireAppOrigin()
    await reportPublicProfile(data.handle, data.reason, requestIp())
    return { sent: true }
  })

const listProfilesForAdminFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler((): Promise<AdminProfileRow[]> => listProfilesForAdmin())

const setProfileHiddenFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      userId: z.string().min(1).max(36),
      reason: z.string().max(500).nullable(),
    })
  )
  .handler(async ({ data }) => {
    await setProfileHidden(data.userId, data.reason)
    return { saved: true }
  })

export function loadMyPublicProfileSettings() {
  return loadMyPublicProfileFn()
}

export function saveMyPublicProfileSettings(
  input: z.infer<typeof profileSchema>
) {
  return saveMyPublicProfileFn({ data: input })
}

export function switchPublicProfile(on: boolean) {
  return switchMyPublicProfileFn({ data: { on } })
}

export function checkPublicProfileWallets() {
  return checkMyWalletsFn()
}

export function readPublicProfile(handle: string) {
  return readPublicProfileFn({ data: { handle } })
}

export function readLeaderboard() {
  return readLeaderboardFn()
}

export function sendProfileReport(handle: string, reason: string) {
  return reportPublicProfileFn({ data: { handle, reason } })
}

export function loadAdminProfiles() {
  return listProfilesForAdminFn()
}

export function setAdminProfileHidden(userId: string, reason: string | null) {
  return setProfileHiddenFn({ data: { userId, reason } })
}
