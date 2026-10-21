import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { DATING_APPS, PROFILE_NAME_MAX } from "@/lib/dating/options"
import {
  accountCounts,
  createAccount,
  deleteAccount,
  ownAccount,
  pickAccount,
  renameAccount,
  requestAccount,
  setAccountPaused,
} from "@/server/dating/accounts"
import { inWords } from "@/server/dating/words"
import { userGet, userPost } from "@/server/guards"
import { createPairingCode } from "@/server/phone/link"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * The profiles' server functions (task "features/06-profiles"): switching,
 * New profile, renaming, Pause and Delete. Every one is behind sign-in, and a
 * profile named from the browser must be the member's own on this site.
 */

const accountInput = z.object({ accountId: z.string().min(1).max(40) })

const pickFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) =>
    inWords(async () => pickAccount(context.user.id, await workspaceIdForRequest(context.user.id), data.accountId))
  )

/** Switches the Dating dashboard to another profile, for every device the member uses. */
export function pickProfile(accountId: string) {
  return pickFn({ data: { accountId } })
}

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ name: z.string().min(1).max(PROFILE_NAME_MAX * 2), app: z.enum(DATING_APPS) }))
  .handler(async ({ data, context }): Promise<{ accountId: string; code: string; expiresAt: Date }> =>
    inWords(async () => {
      const account = await createAccount(await requestAccount(context.user.id), data)
      const { code, expiresAt } = await createPairingCode(account)
      return { accountId: account.id, code, expiresAt }
    })
  )

/** New profile: made with a copy of the open profile's settings, and given a pair code for its phone. Picking it is the window's Done. */
export function createProfile(name: string, app: (typeof DATING_APPS)[number]) {
  return createFn({ data: { name, app } })
}

const renameFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ name: z.string().min(1).max(PROFILE_NAME_MAX * 2) }))
  .handler(async ({ data, context }) => inWords(async () => renameAccount(await requestAccount(context.user.id), data.name)))

/** Renames the open profile. */
export function renameProfile(name: string) {
  return renameFn({ data: { name } })
}

const pauseFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ paused: z.boolean() }))
  .handler(async ({ data, context }) => inWords(async () => setAccountPaused(await requestAccount(context.user.id), data.paused)))

/** Pause or Resume on the open profile. */
export function setProfilePaused(paused: boolean) {
  return pauseFn({ data: { paused } })
}

const countsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const account = await ownAccount(context.user.id, await workspaceIdForRequest(context.user.id), data.accountId)
      return accountCounts(account.id)
    })
  )

/** How many leads and chats Delete takes with it, for the confirm. */
export function loadProfileCounts(accountId: string) {
  return countsFn({ data: { accountId } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(accountInput)
  .handler(async ({ data, context }) =>
    inWords(async () => deleteAccount(await ownAccount(context.user.id, await workspaceIdForRequest(context.user.id), data.accountId)))
  )

/** Deletes a profile with its leads and chats, after the confirm, and frees its phone. */
export function deleteProfile(accountId: string) {
  return deleteFn({ data: { accountId } })
}
