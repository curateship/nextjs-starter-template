import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { listProfiles } from "@/server/browser/profiles"
import {
  accountsByProfile,
  readAccount,
  readBrowserStatus,
  saveAccount,
  type AccountView,
  type BrowserStatus,
} from "@/server/social/accounts"
import {
  queueHealthCheck,
  readAccountHealth,
  type AccountHealth,
} from "@/server/social/health"
import { listVoices } from "@/server/social/voices"

import { createErrorMessage } from "../error-message"

export type { AccountHealth, AccountView, BrowserStatus }

/**
 * The Reddit account settings tab: which browser profile the account signs in
 * inside, and which voice it drafts with.
 *
 * The browser itself is on the Browser profiles dashboard and the words are on
 * the Voices dashboard. Nothing here starts, stops or drives a browser.
 */

export const getAccountErrorMessage = createErrorMessage(
  {
    "already has a Reddit account": "That profile already has a Reddit account in it. Pick another, or make a new profile.",
    "browser profile does not exist": "That browser profile is not there any more. Pick another.",
    "voice does not exist": "That voice is not there any more. Pick another.",
    "Set up a Reddit account first": "Save the account with a browser profile first, then check it.",
  },
  "That did not work. Please try again."
)

export type AccountSettings = {
  account: AccountView | null
  /**
   * The profiles this account could use: every profile with no other Reddit
   * account in it. One Reddit account per profile, or they sign in over each
   * other.
   */
  profiles: Array<{ id: string; name: string }>
  /** Every voice, since any number of accounts may share one. */
  voices: Array<{ id: string; name: string }>
}

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<AccountSettings> => {
    const userId = context.user.id
    const [account, profiles, voices] = await Promise.all([
      readAccount(userId),
      listProfiles(userId),
      listVoices(userId),
    ])
    const accounts = await accountsByProfile(userId, profiles.map((profile) => profile.id))
    return {
      account,
      profiles: profiles
        .filter((profile) =>
          (accounts.get(profile.id) ?? []).every(
            (other) => other.platform !== "reddit" || other.id === account?.id
          )
        )
        .map(({ id, name }) => ({ id, name })),
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
      voiceId: z.string().min(1).nullable(),
    })
  )
  .handler(async ({ context, data }): Promise<AccountView> => saveAccount(context.user.id, data))

export function saveRedditAccount(data: { profileId: string | null; voiceId: string | null }) {
  return saveFn({ data })
}

/**
 * What the Reddit dashboard needs to know about the browser, from the saved
 * rows. Asks no browser anything, so the dashboard can ask every two seconds
 * and nothing moves.
 */
const browserStatusFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<BrowserStatus> => readBrowserStatus(context.user.id))

export function loadBrowserStatus() {
  return browserStatusFn()
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
