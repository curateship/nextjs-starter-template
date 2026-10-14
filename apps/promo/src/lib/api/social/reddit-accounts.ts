import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { listProfiles } from "@/server/browser/profiles"
import { phonesFreeForReddit } from "@/server/phones/phones"
import { accountsByProfile, addAccount, setAccountRunsOn } from "@/server/social/accounts"
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
import { clearBanScreen } from "@/server/phones/health"
import { currentCodes, removeTwoFactor, saveTwoFactor, type CurrentCode } from "@/server/social/two-factor"

import { createErrorMessage } from "../error-message"

export type { BulkAnswer, CurrentCode, RedditAccountRow }

/**
 * The Reddit accounts dashboard's endpoints: every account with its status
 * and what it is plugged into, adding one, and the actions on ticked rows.
 * Admin only, like every Reddit endpoint. Each multi-row action is one
 * request answering with what changed and what did not.
 */

export const getRedditAccountsErrorMessage = createErrorMessage(
  {
    "already has a Reddit account in it": "That profile already has a Reddit account in it. Pick another, or make a new profile.",
    "already has a Reddit account on it": "That phone already has a Reddit account on it. Pick another.",
    "phone does not exist": "That phone is not there any more. Pick another.",
    "never both": "An account runs on a browser profile or a phone, never both.",
    "Pick the browser profile or the phone": "Pick the browser profile or the phone the account runs on.",
    "browser profile does not exist": "That browser profile is not there any more. Pick another.",
    "voice does not exist": "That voice is not there any more. Pick another.",
    "is the reader browser": "That profile is the reader browser, which stays signed in to nobody. Pick another, or change the reader in Settings → Behaviour.",
    "account is not there any more": "That account is not there any more. Reload the page.",
    "There is no reader browser": "Pick a reader browser in Settings → Behaviour first. A health reading needs one.",
    "not an authenticator secret": "That is not an authenticator secret. Paste the letters the site showed, or the otpauth:// link from its QR code.",
    "kind of code Promo does not make": "That link asks for a kind of code Promo does not make. Paste the secret letters instead.",
    ENCRYPTION_NOT_CONFIGURED: "This server has no encryption key set, so a secret cannot be kept.",
    "not stopped by a ban screen": "That account is not stopped any more. Reload the page.",
    "is the self-test phone": "That phone is the self-test phone, which carries only its test account. Pick another phone, or change the self-test phone in Settings → Phones.",
  },
  "That did not work. Please try again."
)

export type RedditAccountsPage = {
  accounts: RedditAccountRow[]
  /** Every voice, for the menu on each row and the Add account window. */
  voices: Array<{ id: string; name: string }>
  /** Profiles that could hold a new account: no Reddit account in them, and not the reader. */
  freeProfiles: Array<{ id: string; name: string }>
  /** Phones that could hold a new account: no Reddit account on them. */
  freePhones: Array<{ id: string; name: string }>
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
      freePhones: await phonesFreeForReddit(userId, null),
    }
  })

/** The list, with the retired accounts too when `retired` is true. */
export function loadRedditAccounts(retired: boolean) {
  return loadFn({ data: { retired } })
}

/** Where an account runs: one browser profile or one phone, never both. */
const runsOn = {
  profileId: z.string().min(1).nullable(),
  phoneId: z.string().min(1).nullable(),
}

const addFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ...runsOn, voiceId: z.string().min(1).nullable() }))
  .handler(async ({ context, data }): Promise<{ id: string }> => ({
    id: await addAccount(context.user.id, data),
  }))

export function addRedditAccount(data: { profileId: string | null; phoneId: string | null; voiceId: string | null }) {
  return addFn({ data })
}

const runsOnFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: z.string().min(1), ...runsOn }))
  .handler(async ({ context, data }): Promise<void> =>
    setAccountRunsOn(context.user.id, data.accountId, { profileId: data.profileId, phoneId: data.phoneId })
  )

/** Moves an account to another browser profile or phone. */
export function setRedditAccountRunsOn(accountId: string, runsOnPick: { profileId: string | null; phoneId: string | null }) {
  return runsOnFn({ data: { accountId, ...runsOnPick } })
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

const twoFactorFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: z.string().min(1), secret: z.string().max(1_000).nullable() }))
  .handler(async ({ context, data }): Promise<void> => {
    if (data.secret === null) await removeTwoFactor(context.user.id, data.accountId)
    else await saveTwoFactor(context.user.id, data.accountId, data.secret)
  })

/** Saves an account's authenticator secret, encrypted, or with null removes it. */
export function setRedditAccountTwoFactor(accountId: string, secret: string | null) {
  return twoFactorFn({ data: { accountId, secret } })
}

const codeFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ accountId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<CurrentCode | null> => {
    const [code] = await currentCodes(context.user.id, { accountIds: [data.accountId] })
    return code ?? null
  })

/** The account's current authenticator code, or null when no secret is saved. */
export function loadRedditAccountCode(accountId: string) {
  return codeFn({ data: { accountId } })
}

const banScreenFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ accountId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => clearBanScreen(context.user.id, data.accountId))

/** Lets an account a ban screen stopped take jobs again. */
export function letRedditAccountRunAgain(accountId: string) {
  return banScreenFn({ data: { accountId } })
}
