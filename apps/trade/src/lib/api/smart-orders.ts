import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { CANDLE_INTERVALS, parseMarketKey } from "@/lib/protocols/contracts"
import { dcaParamsSchema, type DcaParams } from "@/lib/trade/dca"
import { userGet, userPost } from "@/server/guards"
import { loadSmartDca, saveSmartDca } from "@/server/trade/prefs"
import {
  cancelLadderRest as cancelRestRows,
  cancelLadderRung as cancelRungRow,
  placeDcaLadder as placeLadderRows,
  updateLadderExits as updateExitsRows,
  type PlacedLadder,
} from "@/server/trade/smart-orders"
import { findWallet } from "@/server/trade/wallets"

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
  anchorPx: z.number().positive().finite(),
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
async function paperWallet(userId: string, walletId: string) {
  const wallet = await findWallet(userId, walletId)
  if (!wallet) throw new Error("PAPER_WALLET_NOT_FOUND")
  if (wallet.kind !== "paper") throw new Error("PAPER_WALLET_KIND")
  return wallet
}

const placeDcaLadderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(placeSchema)
  .handler(async ({ data, context }): Promise<PlacedLadder> => {
    const wallet = await paperWallet(context.user.id, data.walletId)
    const placed = await placeLadderRows(context.user.id, wallet, {
      marketKey: data.marketKey,
      anchorPx: data.anchorPx,
      interval: data.interval,
      params: data.params,
    })
    // Remembered only once a ladder was really placed with them.
    await saveSmartDca(context.user.id, data.params)
    return placed
  })

const cancelLadderRungFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(rungSchema)
  .handler(async ({ data, context }): Promise<{ cancelled: true }> => {
    const wallet = await paperWallet(context.user.id, data.walletId)
    await cancelRungRow(context.user.id, wallet, data)
    return { cancelled: true }
  })

const cancelLadderRestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(ladderSchema)
  .handler(async ({ data, context }): Promise<{ cancelled: number }> => {
    const wallet = await paperWallet(context.user.id, data.walletId)
    return await cancelRestRows(context.user.id, wallet, data)
  })

const updateLadderExitsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(exitsSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    const wallet = await paperWallet(context.user.id, data.walletId)
    await updateExitsRows(context.user.id, wallet, data)
    return { saved: true }
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

export const getSmartOrderErrorMessage = createErrorMessage(
  {
    PAPER_WALLET_NOT_FOUND:
      "That wallet is not there any more — it may have been deleted in another tab.",
    PAPER_WALLET_KIND: "Only a practice wallet trades this way.",
    PAPER_MARKET: "That market is not one this wallet can trade.",
    PAPER_NO_PRICE:
      "Hyperliquid would not give a price for that market, so nothing was placed.",
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
    SMART_LADDER_NOT_FOUND:
      "That ladder is not there any more — it may have finished or been cancelled.",
    SMART_RUNG_DONE: "That rung already bought or was already called off.",
  },
  "That did not go through. Try it again."
)
