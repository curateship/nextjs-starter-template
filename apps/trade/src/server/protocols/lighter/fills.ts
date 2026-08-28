import { z } from "zod"

import type {
  NetworkId,
  WalletOrderFill,
  WalletOrderInfo,
} from "@/lib/protocols/contracts"
import { num, unscaleLighterNumber } from "@/lib/protocols/lighter/translate"
import { lighterAccountFacts } from "@/server/protocols/lighter/agent"
import { lighterPrivate } from "@/server/protocols/lighter/client"
import { lighterMarketByIndex } from "@/server/protocols/lighter/markets"
import {
  markLighterFillsAttempted,
  markLighterFillsReconciled,
} from "@/server/protocols/lighter/private-feed"
import { lighterAuthToken } from "@/server/protocols/lighter/signer"

/**
 * The trades a Lighter wallet actually made.
 *
 * **Which side of the trade you were on decides everything.** Lighter answers
 * one row per trade with both counterparties in it, so the same row is a buy
 * for one account and a sell for the other. Everything below — the direction,
 * the fee charged, the money banked — is read from the side whose account
 * number matches this wallet's.
 */

/** Lighter's docs put `trades` at weight 600, which is why it pages large. */
const TRADES_WEIGHT = 600
/** The most rows Lighter allows in one answer. */
const PAGE_ROWS = 100

/**
 * Lighter states money in millionths of a dollar. A fee of 100 is $0.0001.
 * The same scale its markets call `supported_quote_decimals`, which was six
 * on every market read on 26 Aug 2026.
 */
const QUOTE_DECIMALS = 6

const numeric = z.union([z.string(), z.number()])

const tradeRowSchema = z.object({
  trade_id_str: z.string().optional(),
  trade_id: numeric.optional(),
  type: z.string().optional(),
  market_id: z.number(),
  size: numeric,
  price: numeric,
  timestamp: z.number(),
  ask_account_id: z.number().optional(),
  bid_account_id: z.number().optional(),
  ask_client_id_str: z.string().optional(),
  bid_client_id_str: z.string().optional(),
  is_maker_ask: z.boolean().optional(),
  taker_fee: numeric.optional(),
  maker_fee: numeric.optional(),
  ask_account_pnl: numeric.optional(),
  bid_account_pnl: numeric.optional(),
  taker_position_size_before: numeric.optional(),
  maker_position_size_before: numeric.optional(),
})

const tradesAnswerSchema = z.object({
  trades: z.array(z.unknown()).default([]),
  next_cursor: z.string().optional(),
})

/**
 * One Lighter trade as this app's own fill, or null when it is not this
 * wallet's trade at all.
 */
export function toLighterFill(
  raw: unknown,
  accountIndex: number,
  marketSymbol: string
): WalletOrderFill | null {
  const parsed = tradeRowSchema.safeParse(raw)
  if (!parsed.success) return null
  const row = parsed.data

  const soldIt = row.ask_account_id === accountIndex
  const boughtIt = row.bid_account_id === accountIndex
  // Neither side is this wallet, so the row belongs to somebody else.
  if (!soldIt && !boughtIt) return null

  const px = num(row.price)
  const sz = num(row.size)
  if (px === null || sz === null) return null

  /**
   * Lighter charges the maker and the taker differently, and states both on
   * the row. Which one applies depends on whether this wallet's side was the
   * resting one — `is_maker_ask` says the ASK was the maker.
   */
  const wasMaker =
    row.is_maker_ask === undefined
      ? // Lighter did not say which side rested. The taker fee is the larger
        // of the two, so assuming it can only overstate what was charged —
        // never flatter the result.
        false
      : row.is_maker_ask
        ? soldIt
        : boughtIt
  const rawFee = wasMaker ? row.maker_fee : row.taker_fee
  const fee = unscaleLighterNumber(num(rawFee) ?? 0, QUOTE_DECIMALS) ?? 0

  /**
   * The money the trade banked, as LIGHTER states it rather than worked out
   * here. A closing trade is the only place the venue itself says what was
   * made, and re-deriving it from prices quietly disagrees with the account.
   */
  const statedPnl = soldIt ? row.ask_account_pnl : row.bid_account_pnl
  const closedPnl = num(statedPnl) ?? 0

  /**
   * Whether this opened or closed, from the size the side was holding before
   * it. Lighter does not put the answer in words, and a position that shrank
   * is a close whichever way the trade went.
   */
  const heldBefore = num(
    wasMaker ? row.maker_position_size_before : row.taker_position_size_before
  )
  const side = soldIt ? ("sell" as const) : ("buy" as const)
  const dir = directionOf(side, heldBefore)

  const fillId = row.trade_id_str ?? String(row.trade_id ?? "")
  if (fillId === "") return null

  return {
    fillId,
    // The app's own order number where Lighter carried it back, so a fill
    // can be traced to the order that made it.
    // Lighter writes 0 where an order carried no id of the app's own, and a
    // zero would read as a real order number the Journal could never match.
    orderId: ownOrderId(soldIt ? row.ask_client_id_str : row.bid_client_id_str),
    marketId: marketSymbol,
    side,
    px,
    sz,
    at: row.timestamp,
    closedPnl,
    fee,
    dir,
    // Lighter says "trade" for an ordinary fill and names the other kinds.
    liquidation: row.type !== undefined && row.type !== "trade",
  }
}

/** The app's own order number, or nothing where Lighter carried none. */
function ownOrderId(stated: string | undefined): string {
  if (stated === undefined || stated === "" || stated === "0") return ""
  return stated
}

/**
 * The venue's own words for what a fill did. Worked out from the holding
 * before it, because Lighter states a size rather than a description.
 */
function directionOf(side: "buy" | "sell", heldBefore: number | null): string {
  if (heldBefore === null || heldBefore === 0) {
    return side === "buy" ? "Open Long" : "Open Short"
  }
  const wasLong = heldBefore > 0
  if (side === "buy") return wasLong ? "Open Long" : "Close Short"
  return wasLong ? "Close Long" : "Open Short"
}

/** Every trade this wallet made since a moment, newest pages first. */
export async function fetchLighterOrderFills(
  network: NetworkId,
  address: string,
  since: number,
  credential: () => string | null
): Promise<WalletOrderFill[]> {
  markLighterFillsAttempted(network, address)
  const facts = await lighterAccountFacts(network, address, credential)
  const token = await lighterAuthToken(facts)

  const fills: WalletOrderFill[] = []
  let cursor: string | undefined
  // Bounded on purpose: this endpoint is Lighter's most expensive, and a
  // wallet with a long history must not spend a whole minute's allowance on
  // one sweep.
  for (let page = 0; page < 5; page += 1) {
    const answer = await lighterPrivate(
      network,
      "/api/v1/trades",
      TRADES_WEIGHT,
      token.token,
      {
        account_index: facts.accountIndex,
        sort_by: "timestamp",
        limit: PAGE_ROWS,
        ...(cursor === undefined ? {} : { cursor }),
      }
    )
    const parsed = tradesAnswerSchema.safeParse(answer)
    if (!parsed.success) break

    /**
     * **Rows older than the moment asked for are skipped, not stopped at.**
     * Lighter's `sort_by` does not promise a direction, and stopping at the
     * first old row would silently drop every newer fill on a page that
     * happens to run oldest-first — a Journal quietly missing trades is
     * worse than five pages of reading.
     */
    for (const raw of parsed.data.trades) {
      const row = tradeRowSchema.safeParse(raw)
      if (!row.success || row.data.timestamp < since) continue
      const market = await lighterMarketByIndex(network, row.data.market_id)
      if (!market) continue
      const fill = toLighterFill(raw, facts.accountIndex, market.symbol)
      if (fill) fills.push(fill)
    }

    cursor = parsed.data.next_cursor
    if (!cursor || parsed.data.trades.length < PAGE_ROWS) break
  }
  // Read all the way through without throwing, so the socket may go back to
  // waiting for something to happen rather than sending the sweep here again
  // on its next tick.
  markLighterFillsReconciled(network, address)
  return fills.sort((left, right) => left.at - right.at)
}

/**
 * What one order turned out to be — a stop firing, a target, or an ordinary
 * sale.
 *
 * Lighter keeps an order's type on the order itself, and this app has not
 * placed a Lighter stop or target yet, so nothing it placed can be either.
 * "none" is a real answer worth storing, so the same question is never asked
 * twice; it becomes a real lookup when stops are built.
 */
export async function fetchLighterOrderInfo(): Promise<WalletOrderInfo> {
  return { kind: "none", triggerPx: null }
}
