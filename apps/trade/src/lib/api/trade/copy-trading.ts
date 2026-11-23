import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  COPY_COINS_MAX,
  type CopyNote,
  type FollowingRow,
  type MyCopiers,
  type ViewerRelation,
} from "@/lib/trade/copy/copy-rules"
import { HANDLE_MAX } from "@/lib/trade/public-profile/profile"
import { findCurrentUser, isActiveAccount } from "@/server/auth/security"
import { adminGet, adminPost, userGet, userPost } from "@/server/guards"
import {
  acceptCopyConsent,
  approveCopyFee,
  followTrader,
  hideCopyNotes,
  loadCopyAdmin,
  loadCopyNotes,
  loadFollowing,
  loadMyCopiers,
  loadViewerRelation,
  markPayoutSent,
  resumeCopy,
  saveCopyConfig,
  saveMyCopySettings,
  setTradersCopyBlocked,
  startCopy,
  stopCopy,
  unfollowTrader,
  unfollowTraders,
  updateCopy,
  type CopyAdmin,
} from "@/server/trade/copy-trading"

import { createErrorMessage } from "../error-message"

export type { CopyAdmin }

/**
 * Following and copying a trader. Everything a member does takes the ordinary
 * guards. The one open door is the profile's own question, "who is looking,
 * and what do they follow or copy", which answers null to a visitor who is
 * not signed in; it is written down in `src/app/open-endpoints.ts`.
 */

const baseMessage = createErrorMessage(
  {
    PROFILE_NOT_FOUND: "That profile is not public.",
    PROFILE_NOT_SAVED: "Save your public profile first.",
    COPY_OWN_PROFILE: "You cannot follow or copy yourself.",
    COPY_STILL_COPYING:
      "You are copying this trader. Stop copying before you unfollow.",
    COPY_CONSENT_NEEDED:
      "Read and accept the note about copying before your first copy.",
    COPY_TRADER_WALLET: "That wallet of the trader's cannot be copied.",
    COPY_WALLET_NOT_FOUND: "That wallet is not yours or no longer exists.",
    COPY_FEE_NOT_APPROVED:
      "Hyperliquid has not approved Trade's fee for this wallet yet. Approve it with your main wallet first.",
    COPY_FEE_WRONG:
      "That approval was for a different fee or address, or it is too old. Approve again.",
    COPY_FEE_UNSUPPORTED: "This exchange has no fee to approve.",
    COPY_ALREADY: "You are already copying this trader.",
    COPY_NOT_FOUND: "That copy has already stopped.",
  },
  "That did not work. Try it again."
)

export function getCopyErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "")
  const typed = /^(?:COPY_INPUT|COPY_NOT_COPYABLE|LIVE_EXCHANGE):([^]+)/.exec(
    message
  )
  return typed ? typed[1] : baseMessage(error)
}

const handleSchema = z.object({ handle: z.string().min(1).max(HANDLE_MAX + 1) })
const idSchema = z.string().min(1).max(36)

const settingsSchema = z.object({
  walletId: idSchema,
  dollarsPerTrade: z.number(),
  maxOpenUsd: z.number(),
  maxLeverage: z.number(),
  coins: z.array(z.string().min(1).max(64)).max(COPY_COINS_MAX).nullable(),
  priceAllowance: z.number(),
  lossLimitUsd: z.number().nullable(),
})

const readViewerRelationFn = createServerFn({ method: "GET" })
  .inputValidator(handleSchema)
  .handler(async ({ data }): Promise<ViewerRelation | null> => {
    // Guarded by hand: a visitor with no account gets null and the page
    // offers to sign in, rather than an error in every visitor's console.
    const user = await findCurrentUser()
    if (!isActiveAccount(user)) return null
    return await loadViewerRelation(user.id, data.handle)
  })

const followFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(handleSchema.extend({ follow: z.boolean() }))
  .handler(async ({ data, context }) => {
    if (data.follow) await followTrader(context.user.id, data.handle)
    else await unfollowTrader(context.user.id, data.handle)
    return { saved: true }
  })

const acceptConsentFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => {
    await acceptCopyConsent(context.user.id)
    return { saved: true }
  })

const startSchema = handleSchema.extend({
  traderWalletId: idSchema,
  settings: settingsSchema,
})

const startCopyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(startSchema)
  .handler(async ({ data, context }) => {
    await startCopy(context.user.id, data)
    return { saved: true }
  })

const updateCopyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ copyId: idSchema, settings: settingsSchema }))
  .handler(async ({ data, context }) => {
    await updateCopy(context.user.id, data.copyId, data.settings)
    return { saved: true }
  })

const stopCopyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ copyId: idSchema, closePositions: z.boolean() }))
  .handler(({ data, context }) =>
    stopCopy(context.user.id, data.copyId, data.closePositions)
  )

const resumeCopyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ copyId: idSchema }))
  .handler(async ({ data, context }) => {
    await resumeCopy(context.user.id, data.copyId)
    return { saved: true }
  })

const loadFollowingFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }): Promise<FollowingRow[]> =>
    loadFollowing(context.user.id)
  )

const loadMyCopiersFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }): Promise<MyCopiers | null> =>
    loadMyCopiers(context.user.id)
  )

const saveMyCopySettingsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      allowCopying: z.boolean(),
      payoutAddress: z.string().max(80).nullable(),
    })
  )
  .handler(async ({ data, context }) => {
    await saveMyCopySettings(context.user.id, data)
    return { saved: true }
  })

const loadCopyNotesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ walletIds: z.array(idSchema).max(200) }))
  .handler(({ data, context }): Promise<CopyNote[]> =>
    loadCopyNotes(context.user.id, data.walletIds)
  )

const hideCopyNotesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ ids: z.array(idSchema).max(500) }))
  .handler(async ({ data, context }) => {
    await hideCopyNotes(context.user.id, data.ids)
    return { saved: true }
  })

const approvalSchema = z.object({
  walletId: idSchema,
  approval: z.object({
    action: z.object({
      type: z.literal("approveBuilderFee"),
      signatureChainId: z.string().regex(/^0x[0-9a-f]+$/i).max(20),
      hyperliquidChain: z.enum(["Mainnet", "Testnet"]),
      maxFeeRate: z.string().max(12),
      builder: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      nonce: z.number().int().positive(),
    }),
    signature: z.object({
      r: z.string().regex(/^0x[0-9a-f]{64}$/i),
      s: z.string().regex(/^0x[0-9a-f]{64}$/i),
      v: z.number().int().min(27).max(28),
    }),
  }),
})

const approveCopyFeeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(approvalSchema)
  .handler(async ({ data, context }) => {
    await approveCopyFee(context.user.id, data.walletId, data.approval)
    return { saved: true }
  })

const loadCopyAdminFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler((): Promise<CopyAdmin> => loadCopyAdmin())

const saveCopyConfigFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      feeRate: z.number(),
      traderShare: z.number(),
      realMoney: z.boolean(),
    })
  )
  .handler(async ({ data }) => {
    await saveCopyConfig(data)
    return { saved: true }
  })

const setTradersCopyBlockedFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ userIds: z.array(idSchema).min(1).max(500), blocked: z.boolean() })
  )
  .handler(({ data }) => setTradersCopyBlocked(data.userIds, data.blocked))

const unfollowManyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ handles: z.array(z.string().min(1).max(HANDLE_MAX + 1)).min(1).max(500) })
  )
  .handler(({ data, context }) => unfollowTraders(context.user.id, data.handles))

const markPayoutSentFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      traderUserId: idSchema,
      amountUsd: z.number(),
      txLink: z.string().max(500),
    })
  )
  .handler(async ({ data, context }) => {
    await markPayoutSent(context.user.id, data)
    return { saved: true }
  })

export function readViewerRelation(handle: string) {
  return readViewerRelationFn({ data: { handle } })
}

export function setFollowing(handle: string, follow: boolean) {
  return followFn({ data: { handle, follow } })
}

export function acceptCopyTerms() {
  return acceptConsentFn()
}

export function startCopying(input: z.infer<typeof startSchema>) {
  return startCopyFn({ data: input })
}

export function updateCopying(
  copyId: string,
  settings: z.infer<typeof settingsSchema>
) {
  return updateCopyFn({ data: { copyId, settings } })
}

export function stopCopying(copyId: string, closePositions: boolean) {
  return stopCopyFn({ data: { copyId, closePositions } })
}

export function resumeCopying(copyId: string) {
  return resumeCopyFn({ data: { copyId } })
}

export function readFollowing() {
  return loadFollowingFn()
}

export function readMyCopiers() {
  return loadMyCopiersFn()
}

export function saveCopySettings(input: {
  allowCopying: boolean
  payoutAddress: string | null
}) {
  return saveMyCopySettingsFn({ data: input })
}

export function readCopyNotes(walletIds: string[]) {
  return loadCopyNotesFn({ data: { walletIds } })
}

export function removeCopyNotes(ids: string[]) {
  return hideCopyNotesFn({ data: { ids } })
}

export function sendCopyFeeApproval(input: z.infer<typeof approvalSchema>) {
  return approveCopyFeeFn({ data: input })
}

export function readCopyAdmin() {
  return loadCopyAdminFn()
}

export function saveCopyAdminConfig(input: {
  feeRate: number
  traderShare: number
  realMoney: boolean
}) {
  return saveCopyConfigFn({ data: input })
}

export function setAdminTradersCopyBlocked(userIds: string[], blocked: boolean) {
  return setTradersCopyBlockedFn({ data: { userIds, blocked } })
}

export function unfollowMany(handles: string[]) {
  return unfollowManyFn({ data: { handles } })
}

export function sendAdminPayout(input: {
  traderUserId: string
  amountUsd: number
  txLink: string
}) {
  return markPayoutSentFn({ data: input })
}
