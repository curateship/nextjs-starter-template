import { withWalletPlanWrite } from "@/server/trade/db"
import {
  closeLivePosition,
  liveHeldPosition,
  liveWallet,
  placeLiveOrder,
  setLiveBrackets,
} from "@/server/trade/live-orders"
import { listActiveSmartOrders } from "@/server/trade/smart-orders"

export type FlipLivePositionInput = {
  walletId: string
  marketKey: string
  expectedSzi: number
}

/** Never reopen after a partial or unconfirmed close, and never retry an entry. */
export async function flipLivePosition(userId: string, input: FlipLivePositionInput) {
  return withWalletPlanWrite(userId, input.walletId, async () => {
    const [held, plans, wallet] = await Promise.all([
      liveHeldPosition(userId, input.walletId, input.marketKey),
      listActiveSmartOrders(userId, [input.walletId]),
      liveWallet(userId, input.walletId),
    ])
    if (wallet.status === "inactive") throw new Error("WALLET_INACTIVE")
    if (!held) throw new Error("LIVE_POSITION_GONE")
    if (held.owned) throw new Error("LIVE_FLIP_OWNED")
    if (held.szi !== input.expectedSzi) throw new Error("LIVE_FLIP_CHANGED")
    if (plans.some((plan) => plan.marketKey === input.marketKey)) {
      throw new Error("LIVE_FLIP_SMART_ORDER")
    }
    const sz = Math.abs(held.szi)
    const side = held.szi > 0 ? "sell" : "buy"
    // Old protection prices belong to the old direction. Refuse a failed
    // removal before selling anything, rather than opening into stale stops.
    if (held.protectionOrderIds.length || held.slPx !== null || held.targets.length) {
      await setLiveBrackets(userId, { ...input, targets: [], slPx: null })
    }
    let closed = false
    try {
      await closeLivePosition(userId, input, {
        expectedSide: side,
        beforeSubmit: async (requestedSz) => {
          if (requestedSz !== sz) throw new Error("LIVE_FLIP_CHANGED")
        },
        afterSubmit: async (filledSz, requestedSz) => {
          closed = Number.isFinite(filledSz) && filledSz >= requestedSz
        },
      })
    } catch {
      throw new Error("LIVE_FLIP_CLOSE_UNCONFIRMED")
    }
    if (!closed) throw new Error("LIVE_FLIP_CLOSE_UNCONFIRMED")
    try {
      // An accepted close is not enough if a fresh read still shows holdings.
      // Another venue client may also have changed the position meanwhile.
      if (await liveHeldPosition(userId, input.walletId, input.marketKey)) {
        throw new Error("LIVE_FLIP_NOT_FLAT")
      }
      const opened = await placeLiveOrder(userId, {
        walletId: input.walletId,
        marketKey: input.marketKey,
        side,
        px: held.entryPx,
        sz,
        leverage: held.leverage,
        reduceOnly: false,
        marketOnly: true,
        byHand: true,
        tpPx: null,
        slPx: null,
      })
      if (opened.status !== "filled" || !Number.isFinite(opened.filledSz) || (opened.filledSz ?? 0) < sz) {
        return { complete: false as const }
      }
      return { complete: true as const }
    } catch {
      // Submission timeouts can hide an accepted entry. Do not say no entry
      // exists, and do not automatically send another order.
      throw new Error("LIVE_FLIP_ENTRY_UNCONFIRMED")
    }
  })
}
