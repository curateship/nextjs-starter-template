import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { listProfiles } from "@/server/browser/profiles"
import { phonesFreeFor } from "@/server/phones/phones"
import {
  accountsByProfile,
  readAccount,
  saveAccount,
  type AccountView,
} from "@/server/social/accounts"
import {
  queueHealthCheck,
  readAccountHealth,
  type AccountHealth,
} from "@/server/social/health"
import { readBehaviour } from "@/server/social/behaviour"
import { listVoices } from "@/server/social/voices"
import { passReaderWritten } from "@/lib/social/refusal-words"

import { createErrorMessage } from "../error-message"

export type { AccountHealth, AccountView }

/**
 * The Reddit account settings tab: which browser profile the oldest account
 * in use signs in inside, and which voice it drafts with. Every other account
 * is on the Reddit accounts dashboard.
 *
 * The browser itself is on the Browser profiles dashboard and the words are on
 * the Voices dashboard. Nothing here starts, stops or drives a browser.
 */

export const getAccountErrorMessage = passReaderWritten(createErrorMessage(
  {
    "already has a Reddit account in it": "That profile already has a Reddit account in it. Pick another, or make a new profile.",
    "already has a Reddit account on it": "That phone already has a Reddit account on it. Pick another.",
    "phone does not exist": "That phone is not there any more. Pick another.",
    "never both": "An account runs on a browser profile or a phone, never both.",
    "browser profile does not exist": "That browser profile is not there any more. Pick another.",
    "voice does not exist": "That voice is not there any more. Pick another.",
    "Set up a Reddit account first": "Save the account with a browser profile first, then check it.",
    "is the reader browser": "That profile is the reader browser, which stays signed in to nobody. Pick another, or change the reader in Settings → Behaviour.",
  },
  "That did not work. Please try again."
))

export type AccountSettings = {
  account: AccountView | null
  /**
   * The profiles this account could use: every profile with no other Reddit
   * account in it. One Reddit account per profile, or they sign in over each
   * other. The reader browser is left out, since it is signed in to nobody.
   */
  profiles: Array<{ id: string; name: string }>
  /** The phones it could run on instead: every phone with no other Reddit account. */
  phones: Array<{ id: string; name: string; note: string }>
  /** Every voice, since any number of accounts may share one. */
  voices: Array<{ id: string; name: string }>
}

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<AccountSettings> => {
    const userId = context.user.id
    const [account, profiles, voices, behaviour] = await Promise.all([
      readAccount(userId),
      listProfiles(userId),
      listVoices(userId),
      readBehaviour(userId),
    ])
    const accounts = await accountsByProfile(userId, profiles.map((profile) => profile.id))
    return {
      account,
      profiles: profiles
        .filter((profile) => profile.id !== behaviour.readerProfileId)
        .filter((profile) =>
          (accounts.get(profile.id) ?? []).every(
            (other) => other.platform !== "reddit" || other.id === account?.id
          )
        )
        .map(({ id, name }) => ({ id, name })),
      phones: await phonesFreeFor(userId, account?.id ?? null),
      voices: voices.map(({ id, name }) => ({ id, name })),
    }
  })

export function loadRedditAccount() {
  return loadFn()
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      profileId: z.string().min(1).nullable(),
      phoneId: z.string().min(1).nullable(),
      voiceId: z.string().min(1).nullable(),
    })
  )
  .handler(async ({ context, data }): Promise<AccountView> => saveAccount(context.user.id, data))

export function saveRedditAccount(data: { profileId: string | null; phoneId: string | null; voiceId: string | null }) {
  return saveFn({ data })
}

/**
 * The account's karma, age and how its profile looks to a stranger, as last
 * read, and whether a check is under way. Null when no account is set up.
 */
const healthFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<AccountHealth | null> => {
    const account = await readAccount(context.user.id)
    return account ? readAccountHealth(context.user.id, account.id) : null
  })

export function loadAccountHealth() {
  return healthFn()
}

/**
 * Asks the browser program for a fresh reading. Returns once the job is
 * written; the settings tab asks again until it has finished.
 */
const checkHealthFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async ({ context }): Promise<void> => {
    const account = await readAccount(context.user.id)
    if (!account) throw new Error("Set up a Reddit account first.")
    await queueHealthCheck(context.user.id, account.id)
  })

export function checkAccountHealthNow() {
  return checkHealthFn()
}
