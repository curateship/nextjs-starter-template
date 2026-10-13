import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { listProfiles } from "@/server/browser/profiles"
import { accountsByProfile, addAccount } from "@/server/social/accounts"
import {
  checkAccountsNow,
  listRedditAccounts,
  retireAccounts,
  setAccountVoice,
  setAccountsStatus,
  type BulkAnswer,
  type RedditAccountRow,
} from "@/server/social/account-list"
import { readBehaviour } from "@/server/social/behaviour"
import { setAccountsPaused } from "@/server/social/pause"
import { listVoices } from "@/server/social/voices"
import { ACCOUNT_STATUSES } from "@/lib/social/account-status"

import { createErrorMessage } from "../error-message"

export type { BulkAnswer, RedditAccountRow }

/**
 * The Reddit accounts dashboard's endpoints: every account with its status
 * and what it is plugged into, adding one, and the actions on ticked rows.
 * Admin only, like every Reddit endpoint. Each multi-row action is one
 * request answering with what changed and what did not.
 */

export const getRedditAccountsErrorMessage = createErrorMessage(
  {
    "already has a Reddit account": "That profile already has a Reddit account in it. Pick another, or make a new profile.",
    "browser profile does not exist": "That browser profile is not there any more. Pick another.",
    "voice does not exist": "That voice is not there any more. Pick another.",
    "is the reader browser": "That profile is the reader browser, which stays signed in to nobody. Pick another, or change the reader in Settings → Behaviour.",
    "account is not there any more": "That account is not there any more. Reload the page.",
    "There is no reader browser": "Pick a reader browser in Settings → Behaviour first. A health reading needs one.",
  },
  "That did not work. Please try again."
)

export type RedditAccountsPage = {
  accounts: RedditAccountRow[]
  /** Every voice, for the menu on each row and the Add account window. */
  voices: Array<{ id: string; name: string }>
  /** Profiles that could hold a new account: no Reddit account in them, and not the reader. */
  freeProfiles: Array<{ id: string; name: string }>
}

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ retired: z.boolean() }))
  .handler(async ({ context, data }): Promise<RedditAccountsPage> => {
    const userId = context.user.id
    const [accounts, voices, profiles, behaviour] = await Promise.all([
      listRedditAccounts(userId, { retired: data.retired }),
      listVoices(userId),
      listProfiles(userId),
      readBehaviour(userId),
    ])
    const holders = await accountsByProfile(userId, profiles.map((profile) => profile.id))
    return {
      accounts,
      voices: voices.map(({ id, name }) => ({ id, name })),
      freeProfiles: profiles
        .filter((profile) => profile.id !== behaviour.readerProfileId)
        .filter((profile) => !(holders.get(profile.id) ?? []).some((other) => other.platform === "reddit"))
        .map(({ id, name }) => ({ id, name })),
    }
  })

/** The list, with the retired accounts too when `retired` is true. */
export function loadRedditAccounts(retired: boolean) {
  return loadFn({ data: { retired } })
}

const addFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ profileId: z.string().min(1), voiceId: z.string().min(1).nullable() }))
  .handler(async ({ context, data }): Promise<{ id: string }> => ({
    id: await addAccount(context.user.id, data),
  }))

export function addRedditAccount(data: { profileId: string; voiceId: string | null }) {
  return addFn({ data })
}

const ids = z.array(z.string().min(1)).min(1).max(200)

const statusFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids, status: z.enum(ACCOUNT_STATUSES).nullable() }))
  .handler(async ({ context, data }): Promise<BulkAnswer> =>
    setAccountsStatus(context.user.id, data.ids, data.status)
  )

/** Sets a status by hand, or with null lets the app decide again. */
export function setRedditAccountsStatus(
  accountIds: string[],
  status: (typeof ACCOUNT_STATUSES)[number] | null
) {
  return statusFn({ data: { ids: accountIds, status } })
}

const checkFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids }))
  .handler(async ({ context, data }): Promise<BulkAnswer> => checkAccountsNow(context.user.id, data.ids))

export function checkRedditAccounts(accountIds: string[]) {
  return checkFn({ data: { ids: accountIds } })
}

const retireFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids, retire: z.boolean() }))
  .handler(async ({ context, data }): Promise<BulkAnswer> =>
    retireAccounts(context.user.id, data.ids, data.retire)
  )

/** Retires accounts, or with `retire` false brings them back. */
export function retireRedditAccounts(accountIds: string[], retire: boolean) {
  return retireFn({ data: { ids: accountIds, retire } })
}

const pauseFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids, paused: z.boolean() }))
  .handler(async ({ context, data }): Promise<BulkAnswer> =>
    setAccountsPaused(context.user.id, data.ids, data.paused)
  )

/**
 * Pauses accounts, or with `paused` false resumes them. A paused account does
 * not post, warm up or take health readings until it is resumed.
 */
export function pauseRedditAccounts(accountIds: string[], paused: boolean) {
  return pauseFn({ data: { ids: accountIds, paused } })
}

const voiceFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: z.string().min(1), voiceId: z.string().min(1).nullable() }))
  .handler(async ({ context, data }): Promise<void> =>
    setAccountVoice(context.user.id, data.accountId, data.voiceId)
  )

export function setRedditAccountVoice(accountId: string, voiceId: string | null) {
  return voiceFn({ data: { accountId, voiceId } })
}
