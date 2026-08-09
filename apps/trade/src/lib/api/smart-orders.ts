import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { CANDLE_INTERVALS, parseMarketKey } from "@/lib/protocols/contracts"
import { dcaParamsSchema, type DcaParams } from "@/lib/trade/dca"
import { userGet, userPost } from "@/server/guards"
import { marketBaseInForce } from "@/server/trade/base-level"
import {
  cancelLiveLadderRest,
  cancelLiveLadderRung,
  placeLiveDcaLadder,
  reconcileLiveLadders,
  updateLiveLadderExits,
} from "@/server/trade/live-smart-orders"
import { loadSmartDca, saveSmartDca } from "@/server/trade/prefs"
import {
  cancelLadderRest as cancelRestRows,
  cancelLadderRung as cancelRungRow,
  placeDcaLadder as placeLadderRows,
  updateLadderExits as updateExitsRows,
  type PlacedLadder,
} from "@/server/trade/smart-orders"
import {
  findTradingWallet,
  findWallet,
  listWallets,
} from "@/server/trade/wallets"

import { createErrorMessage } from "./error-message"

/**
 * Smart orders: one right-click places a whole DCA ladder, and these are the
 * actions behind it — place, call off one rung, call off the rest, change the
 * exits, and remember the window's settings.
 *
 * Every function starts by finding the wallet the request names, scoped to
 * whoever is asking. The browser never sends a size or a rung price — the
 * server derives every number — so a wrong one cannot be sent.
 */

const marketKeySchema = z
  .string()
  .max(120)
  .refine((key) => parseMarketKey(key) !== null, { message: "PAPER_MARKET" })

const placeSchema = z.object({
  walletId: z.string().max(36),
  marketKey: marketKeySchema,
  clickPx: z.number().positive().finite(),
  interval: z.enum(CANDLE_INTERVALS),
  params: dcaParamsSchema,
})

const rungSchema = z.object({
  walletId: z.string().max(36),
  ladderId: z.string().max(36),
  rungIndex: z.number().int().min(0).max(19),
})

const ladderSchema = z.object({
  walletId: z.string().max(36),
  ladderId: z.string().max(36),
})

const exitsSchema = z.object({
  walletId: z.string().max(36),
  ladderId: z.string().max(36),
  takeProfit: dcaParamsSchema.shape.takeProfit,
  stopLoss: dcaParamsSchema.shape.stopLoss,
})

/** The wallet, or a refusal — the same first step as the rest of trading. */
async function tradingWallet(
  userId: string,
  walletId: string,
  receivingOrder = false
) {
  const wallet = await (receivingOrder ? findTradingWallet : findWallet)(
    userId,
    walletId
  )
  if (!wallet) throw new Error("PAPER_WALLET_NOT_FOUND")
  return wallet
}

/**
 * The base a ladder would hang from right now.
 *
 * The window asks before it draws anything: the rungs it previews are stepped
 * down from this, and so are the rungs the server writes, so what is shown is
 * what is placed. Null when no base has confirmed, which is a ladder that
 * cannot be placed and a window that says so.
 */
const loadLadderBaseFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ marketKey: marketKeySchema }))
  .handler(async ({ data }): Promise<{ basePx: number | null }> => {
    const ref = parseMarketKey(data.marketKey)
    if (!ref) return { basePx: null }
    return {
      basePx: await marketBaseInForce(ref.protocol, ref.network, ref.marketId, Date.now()),
    }
  })

export function loadLadderBase(marketKey: string): Promise<{ basePx: number | null }> {
  return loadLadderBaseFn({ data: { marketKey } })
}

const placeDcaLadderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(placeSchema)
  .handler(async ({ data, context }): Promise<PlacedLadder> => {
    const wallet = await tradingWallet(context.user.id, data.walletId, true)
    const input = {
      marketKey: data.marketKey,
      clickPx: data.clickPx,
      interval: data.interval,
      params: data.params,
    }
    const placed =
      wallet.kind === "live"
        ? await placeLiveDcaLadder(context.user.id, wallet, input)
        : await placeLadderRows(context.user.id, wallet, input)
    // Remembered only once a ladder was really placed with them.
    await saveSmartDca(context.user.id, data.params)
    return placed
  })

const cancelLadderRungFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(rungSchema)
  .handler(async ({ data, context }): Promise<{ cancelled: true }> => {
    const wallet = await tradingWallet(context.user.id, data.walletId)
    if (wallet.kind === "live") {
      await cancelLiveLadderRung(context.user.id, wallet, data)
    } else {
      await cancelRungRow(context.user.id, wallet, data)
    }
    return { cancelled: true }
  })

const cancelLadderRestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(ladderSchema)
  .handler(async ({ data, context }): Promise<{ cancelled: number }> => {
    const wallet = await tradingWallet(context.user.id, data.walletId)
    return wallet.kind === "live"
      ? await cancelLiveLadderRest(context.user.id, wallet, data)
      : await cancelRestRows(context.user.id, wallet, data)
  })

const updateLadderExitsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(exitsSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    const wallet = await tradingWallet(context.user.id, data.walletId)
    if (wallet.kind === "live") {
      await updateLiveLadderExits(context.user.id, wallet, data)
    } else {
      await updateExitsRows(context.user.id, wallet, data)
    }
    return { saved: true }
  })

const reconcileLiveLaddersFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }): Promise<{ checked: true }> => {
    const wallets = await listWallets(context.user.id)
    await Promise.allSettled(
      wallets
        .filter((wallet) => wallet.kind === "live" && wallet.hasKey)
        .map((wallet) => reconcileLiveLadders(context.user.id, wallet))
    )
    return { checked: true }
  })

/** The window's remembered settings, or null the first time it opens. */
const loadSmartDcaFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ params: DcaParams | null }> => {
    return { params: await loadSmartDca(context.user.id) }
  })

export function placeDcaLadder(input: z.infer<typeof placeSchema>) {
  return placeDcaLadderFn({ data: input })
}

export function cancelLadderRung(input: z.infer<typeof rungSchema>) {
  return cancelLadderRungFn({ data: input })
}

export function cancelLadderRest(input: z.infer<typeof ladderSchema>) {
  return cancelLadderRestFn({ data: input })
}

export function updateLadderExits(input: z.infer<typeof exitsSchema>) {
  return updateLadderExitsFn({ data: input })
}

export function loadSmartDcaParams() {
  return loadSmartDcaFn()
}

export function reconcileLiveSmartOrders() {
  return reconcileLiveLaddersFn()
}

export const getSmartOrderErrorMessage = createErrorMessage(
  {
    PAPER_WALLET_NOT_FOUND:
      "That wallet is not there any more — it may have been deleted in another tab.",
    PAPER_WALLET_KIND: "Only a practice wallet trades this way.",
    WALLET_INACTIVE: "Make this wallet active before placing a Smart order.",
    LIVE_WALLET_KEY: "This live wallet needs a trading key before it can place a Smart order.",
    LIVE_MARKET: "That market is not one this live wallet can trade.",
    LIVE_NO_PRICE: "Hyperliquid would not give a price for that market, so nothing was placed.",
    LIVE_MAINNET_OFF:
      "Real-money trading is switched off until the funded test run passes and TRADE_ENABLE_MAINNET is deliberately set.",
    LIVE_ORDER_GONE:
      "A ladder order is no longer on the exchange. The ladder will reconcile before the next action.",
    LIVE_POSITION_GONE:
      "The ladder's position is no longer on the exchange. Its remaining orders will be reconciled.",
    LIVE_BRACKETS_GONE:
      "The exchange removed the old protection but refused its replacement. Check the position now.",
    LIVE_SMART_ORDER_NOT_RESTING:
      "A Smart-order rung did not rest as expected, so the ladder was rolled back.",
    LIVE_SMART_ROLLBACK_FAILED:
      "Hyperliquid accepted part of the ladder and would not cancel all of it. Check the open orders now.",
    PAPER_MARKET: "That market is not one this wallet can trade.",
    PAPER_NO_PRICE: "Hyperliquid would not give a price for that market, so nothing was placed.",
    PAPER_PRICE: "That price cannot be used. Pick a level on the chart again.",
    PAPER_ORDER_LIMIT:
      "That many rungs would pass the fifty-order cap. Cancel some orders or use fewer rungs.",
    SMART_LADDER_EXISTS:
      "This market already has a live ladder in that wallet — cancel it before placing another.",
    SMART_SHORT_HELD:
      "This wallet is short this market, and a buy ladder would just shrink the short. Close it first.",
    SMART_RUNG_TOO_SMALL:
      "A rung is too small to be an order at this market's size step — nothing was placed. Use fewer rungs, a gentler ramp, or a bigger share.",
    SMART_LADDER_COST:
      "The whole ladder costs more than the free cash — nothing was placed. Use a smaller share or fewer rungs.",
    SMART_LADDER_ABOVE_MARKET:
      "Every rung sits above the price right now, so there is nothing left to wait for — nothing was placed.",
    SMART_LADDER_NO_BASE:
      "This market has no confirmed base yet, and the ladder hangs from one — nothing was placed. Wait for the chart to mark a base.",
    SMART_LADDER_UNDER_BASE:
      "Price is already below the base, so that level has gone — nothing was placed. The ladder starts when price is at or above a base and buys the fall from there.",
    SMART_LADDER_NOT_FOUND:
      "That ladder is not there any more — it may have finished or been cancelled.",
    SMART_RUNG_DONE: "That rung already bought or was already called off.",
  },
  "That did not go through. Try it again."
)
