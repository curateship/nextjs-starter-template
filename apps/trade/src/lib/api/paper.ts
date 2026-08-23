import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { parseMarketKey } from "@/lib/protocols/contracts"
import type { SmartOrder } from "@/lib/trade/smart-plan"
import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"
import type { PaperOrder, PaperPosition } from "@/lib/trade/paper"
import { userGet, userPost } from "@/server/guards"
import {
  cancelPaperOrder as cancelOrderRow,
  closeAllPaperPositions as closeAllRows,
  closePaperPosition as closePositionRow,
  flipPaperPosition as flipPositionRow,
  hidePaperJournalEntries as hideJournalRows,
  loadPaperHistoryBefore,
  loadPaperPortfolio as loadPortfolio,
  movePaperOrder as moveOrderRow,
  placePaperOrder as placeOrderRow,
  setPaperBrackets as setBracketsRow,
  updatePaperOrder as updateOrderRow,
} from "@/server/trade/paper"
import { loadOrderStyle } from "@/server/trade/prefs"
import {
  listActiveSmartOrders,
  placeWatchOrder,
} from "@/server/trade/smart-orders"
import {
  findTradingWallet,
  findWallet,
  listWallets,
} from "@/server/trade/wallets"

import { createErrorMessage } from "./error-message"

/**
 * Practice trading: placing, moving and closing, and the one read that draws
 * the chart's lines and the whole bottom panel.
 *
 * Every function starts by finding the wallet the request names, scoped to
 * whoever is asking — so a request carrying somebody else's wallet id gets
 * "that wallet is not there", never somebody else's trades. The engine behind
 * these is settled on read, so the answer is always current rather than merely
 * stored.
 */

const marketKeySchema = z
  .string()
  .max(120)
  .refine((key) => parseMarketKey(key) !== null, { message: "PAPER_MARKET" })

const placeSchema = z.object({
  walletId: z.string().max(36),
  marketKey: marketKeySchema,
  side: z.enum(["buy", "sell"]),
  px: z.number().positive().finite(),
  sz: z.number().positive().finite(),
  leverage: z.number().min(1).max(100),
  reduceOnly: z.boolean(),
  tpPx: z.number().positive().finite().nullable(),
  slPx: z.number().positive().finite().nullable(),
})

const moveSchema = z.object({
  walletId: z.string().max(36),
  orderId: z.string().max(36),
  px: z.number().positive().finite(),
})

const orderSchema = z.object({
  walletId: z.string().max(36),
  orderId: z.string().max(36),
})

/** Everything about a waiting order except its price, which the drag owns. */
const updateSchema = z.object({
  walletId: z.string().max(36),
  orderId: z.string().max(36),
  sz: z.number().positive().finite(),
  tpPx: z.number().positive().finite().nullable(),
  slPx: z.number().positive().finite().nullable(),
})

const bracketsSchema = z.object({
  walletId: z.string().max(36),
  marketKey: marketKeySchema,
  tpPx: z.number().positive().finite().nullable(),
  // Coins the target sells when it fires; null sells the whole position.
  tpSz: z.number().positive().finite().nullable().optional(),
  slPx: z.number().positive().finite().nullable(),
})

const positionSchema = z.object({
  walletId: z.string().max(36),
  marketKey: marketKeySchema,
})

/** The wallet, or a refusal — the same first step for every function here. */
async function paperWallet(
  userId: string,
  walletId: string,
  receivingOrder = false
) {
  const wallet = await (receivingOrder ? findTradingWallet : findWallet)(
    userId,
    walletId
  )
  if (!wallet) throw new Error("PAPER_WALLET_NOT_FOUND")
  if (wallet.kind !== "paper") throw new Error("PAPER_WALLET_KIND")
  return wallet
}

/**
 * Everything held, waiting and done — across every practice wallet, not just
 * the one being traded with. The wallet names come back with it so each row
 * can say which wallet it belongs to without a second request.
 */
const loadPaperPortfolioFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(
    async ({
      context,
    }): Promise<{
      positions: PaperPosition[]
      orders: PaperOrder[]
      fills: LiveFill[]
      /** Finished practice round trips — the Journal, alongside the real ones. */
      trades: LiveTrade[]
      nextBefore: number | null
      smartOrders: SmartOrder[]
      wallets: { id: string; label: string }[]
    }> => {
      const wallets = await listWallets(context.user.id)
      const portfolio = await loadPortfolio(context.user.id, wallets)
      const paper = wallets.filter((wallet) => wallet.kind === "paper")
      // Read after the settle inside the portfolio load, so a smart order a
      // stop just finished is already gone from the answer.
      const smartOrders = await listActiveSmartOrders(
        context.user.id,
        paper.map((wallet) => wallet.id)
      )
      return {
        ...portfolio,
        smartOrders,
        wallets: paper.map((wallet) => ({ id: wallet.id, label: wallet.label })),
      }
    }
  )

const loadOlderPaperTradesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ before: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    const wallets = (await listWallets(context.user.id)).filter(
      (wallet) => wallet.kind === "paper"
    )
    const { trades, nextBefore } = await loadPaperHistoryBefore(
      context.user.id,
      wallets.map((wallet) => wallet.id),
      data.before
    )
    return { trades, nextBefore }
  })

const placePaperOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(placeSchema)
  .handler(async ({ data, context }): Promise<{ placed: true }> => {
    const wallet = await paperWallet(context.user.id, data.walletId, true)
    // Asked here rather than sent up from the window: which way an order waits
    // is an account setting, and a browser that could name it could place an
    // order the setting says it may not.
    if ((await loadOrderStyle(context.user.id)) === "watch") {
      await placeWatchOrder(context.user.id, wallet, data)
      return { placed: true }
    }
    await placeOrderRow(context.user.id, wallet, data)
    return { placed: true }
  })

const movePaperOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(moveSchema)
  .handler(async ({ data, context }): Promise<{ moved: true }> => {
    const wallet = await paperWallet(context.user.id, data.walletId)
    await moveOrderRow(context.user.id, wallet, data)
    return { moved: true }
  })

const updatePaperOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    const wallet = await paperWallet(context.user.id, data.walletId)
    await updateOrderRow(context.user.id, wallet, data)
    return { saved: true }
  })

const cancelPaperOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(orderSchema)
  .handler(async ({ data, context }): Promise<{ cancelled: true }> => {
    const wallet = await paperWallet(context.user.id, data.walletId)
    await cancelOrderRow(context.user.id, wallet.id, data.orderId)
    return { cancelled: true }
  })

const setPaperBracketsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(bracketsSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    const wallet = await paperWallet(context.user.id, data.walletId)
    await setBracketsRow(context.user.id, wallet, data)
    return { saved: true }
  })

const closePaperPositionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(positionSchema)
  .handler(async ({ data, context }): Promise<{ closed: true }> => {
    const wallet = await paperWallet(context.user.id, data.walletId)
    await closePositionRow(context.user.id, wallet, data.marketKey)
    return { closed: true }
  })

const flipPaperPositionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(positionSchema)
  .handler(async ({ data, context }): Promise<{ flipped: true }> => {
    const wallet = await paperWallet(context.user.id, data.walletId)
    await flipPositionRow(context.user.id, wallet, data.marketKey)
    return { flipped: true }
  })

/** Closes every position in every practice wallet, not just the active one. */
const closeAllPaperPositionsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }): Promise<{ closed: number }> => {
    const wallets = await listWallets(context.user.id)
    return await closeAllRows(context.user.id, wallets)
  })

/**
 * Takes one finished practice trade off the Journal, by hiding the fills it
 * was made of.
 *
 * Hidden, not deleted: the wallet's cash IS the sum of these rows, so removing
 * one would move the balance — bin a loss and the wallet hands the money back.
 */
const hidePaperTradeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ fillIds: z.array(z.string().max(36)).min(1).max(200) })
  )
  .handler(async ({ data, context }): Promise<{ hidden: true }> => {
    await hideJournalRows(context.user.id, data.fillIds)
    return { hidden: true }
  })

export function loadPaperPortfolio() {
  return loadPaperPortfolioFn()
}

export function loadOlderPaperTrades(before: number) {
  return loadOlderPaperTradesFn({ data: { before } })
}

export function placePaperOrder(input: z.infer<typeof placeSchema>) {
  return placePaperOrderFn({ data: input })
}

export function movePaperOrder(input: z.infer<typeof moveSchema>) {
  return movePaperOrderFn({ data: input })
}

export function updatePaperOrder(input: z.infer<typeof updateSchema>) {
  return updatePaperOrderFn({ data: input })
}

export function cancelPaperOrder(walletId: string, orderId: string) {
  return cancelPaperOrderFn({ data: { walletId, orderId } })
}

export function setPaperBrackets(input: z.infer<typeof bracketsSchema>) {
  return setPaperBracketsFn({ data: input })
}

export function closePaperPosition(walletId: string, marketKey: string) {
  return closePaperPositionFn({ data: { walletId, marketKey } })
}

export function flipPaperPosition(walletId: string, marketKey: string) {
  return flipPaperPositionFn({ data: { walletId, marketKey } })
}

export function closeAllPaperPositions() {
  return closeAllPaperPositionsFn()
}

export function hidePaperTrade(fillIds: string[]) {
  return hidePaperTradeFn({ data: { fillIds } })
}

export const getPaperErrorMessage = createErrorMessage(
  {
    PAPER_WALLET_NOT_FOUND:
      "That wallet is not there any more — it may have been deleted in another tab.",
    PAPER_WALLET_KIND: "Only a practice wallet trades this way.",
    WALLET_INACTIVE: "Make this wallet active before placing a new order.",
    PAPER_MARKET: "That market is not one this wallet can trade.",
    PAPER_NO_PRICE:
      "The exchange would not give a price for that market, so nothing was done.",
    PAPER_PRICE: "That price cannot be used. Pick a level on the chart again.",
    PAPER_SIZE: "That size is too small to be an order.",
    SMART_LADDER_EXISTS:
      "This market already has a ladder, grid or watched price in that wallet. There can only be one of them per market — cancel it before setting another.",
    PAPER_LEVERAGE: "That is more leverage than this market allows.",
    PAPER_MARGIN:
      "There is not enough free cash for that. Use a smaller size, more leverage, or close something first.",
    PAPER_ORDER_LIMIT:
      "Fifty waiting orders is the cap — cancel one before adding another.",
    PAPER_ORDER_NOT_FOUND:
      "That order is gone — it may have filled or been cancelled already.",
    PAPER_POSITION_NOT_FOUND:
      "That position is gone — it may have closed already.",
    PAPER_REDUCE_ONLY:
      "A reduce-only order needs a position to reduce, and there is not one.",
    PAPER_TAKE_PROFIT_SIDE:
      "A take profit has to be where the trade wins — above the entry on a long, below it on a short.",
    PAPER_TAKE_PROFIT_SIZE:
      "The take profit has to sell at least the market's smallest step and no more than the position holds.",
    PAPER_STOP_SIDE:
      "A stop must stay beyond the current price — below it on a long, above it on a short.",
  },
  "That did not go through. Try it again."
)
