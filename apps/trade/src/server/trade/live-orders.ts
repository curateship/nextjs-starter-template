import { randomUUID } from "node:crypto"

import { and, eq, sql } from "drizzle-orm"

import {
  parseMarketKey,
  type NetworkId,
  type OrderAuth,
  type PlaceOrderOutcome,
} from "@/lib/protocols/contracts"
import {
  livePortfolioRows,
  type LiveJournalAction,
} from "@/lib/trade/live"
import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"
import {
  isMarketable,
  type PaperOrder,
  type PaperPosition,
  type PaperSide,
} from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { decryptSecret } from "@/server/auth/encryption"
import {
  getProtocol,
  ordersOf,
} from "@/server/protocols/registry"
import { loadLiveHistory, sweepLiveFills } from "@/server/trade/live-fills"
import {
  tradeLiveJournal,
  tradeWalletNonces,
  tradeWallets,
} from "@/server/trade/schema"

/**
 * Real orders, app side. The protocol adapter signs; this file owns
 * everything around the signing:
 *
 * - **The wallet checks.** Every function starts from (userId, walletId), so
 *   somebody else's wallet id can only ever miss; the wallet must be live,
 *   hold a key, and be on the SAME network as the market being traded — a
 *   testnet wallet can never place a mainnet order, or the reverse.
 * - **The key's whole life.** Decrypted here, immediately before the adapter
 *   call, passed once, never stored anywhere else — not even in a local that
 *   outlives the call.
 * - **The order-number counter.** One atomic bump per signature, in the
 *   database, shared by every producer.
 * - **The journal.** Every ask and every refusal lands in
 *   `trade_live_journal` before the answer travels — with real money the
 *   record is part of the action, not an afterthought. Journal writes
 *   themselves never take the trading path down; a failed write is logged
 *   and the action's own result stands.
 */

/** One atomic bump: never reused, never behind the clock. */
async function allocateNonce(address: string, network: NetworkId): Promise<number> {
  const now = Date.now()
  const rows = await db
    .insert(tradeWalletNonces)
    .values({ address, network, lastNonce: now })
    .onConflictDoUpdate({
      target: [tradeWalletNonces.address, tradeWalletNonces.network],
      set: {
        lastNonce: sql`greatest(${tradeWalletNonces.lastNonce} + 1, ${now})`,
      },
    })
    .returning({ lastNonce: tradeWalletNonces.lastNonce })
  return rows[0].lastNonce
}

type LiveWalletRow = typeof tradeWallets.$inferSelect

/** The wallet, or the refusal — the same first step as the paper store's. */
async function liveWallet(userId: string, walletId: string): Promise<LiveWalletRow> {
  const rows = await db
    .select()
    .from(tradeWallets)
    .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, walletId)))
    .limit(1)
  const row = rows[0]
  if (!row) throw new Error("LIVE_WALLET_NOT_FOUND")
  if (row.kind !== "live") throw new Error("LIVE_WALLET_KIND")
  if (!row.address || !row.agentKeyEncrypted) throw new Error("LIVE_WALLET_KEY")
  return row
}

/**
 * The market a request names, checked against the wallet it would trade
 * from. The network rule is the heart of it: the wallet's network and the
 * market's must MATCH — that one comparison is what makes "testnet first"
 * enforceable at all. Sub-exchange markets ("xyz:IBM") pass through like any
 * other: the adapter reads and numbers every venue.
 */
function checkedMarket(row: LiveWalletRow, marketKey: string) {
  const ref = parseMarketKey(marketKey)
  if (!ref) throw new Error("LIVE_MARKET")
  if (ref.protocol !== row.protocol) throw new Error("LIVE_MARKET")
  if (ref.network !== row.network) throw new Error("LIVE_NETWORK_MISMATCH")
  return ref
}

/** The one moment plaintext exists: decrypt, hand over, done. */
function authFor(row: LiveWalletRow): OrderAuth {
  return {
    agentKey: decryptSecret(row.agentKeyEncrypted ?? ""),
    allocateNonce: (signerAddress) => allocateNonce(signerAddress, row.network),
  }
}

/**
 * One row written for every ask and every refusal. Never throws — the
 * journal must not take the trading path down — but a lost row is loudly
 * logged, because a silent gap in this record defeats its purpose.
 */
async function journal(
  userId: string,
  walletId: string,
  marketKey: string,
  entry: {
    action: LiveJournalAction
    side: PaperSide | null
    px?: number
    sz?: number
    note?: string | null
  }
): Promise<void> {
  try {
    await db.insert(tradeLiveJournal).values({
      userId,
      walletId,
      id: randomUUID(),
      marketKey,
      action: entry.action,
      side: entry.side,
      px: entry.px ?? 0,
      sz: entry.sz ?? 0,
      note: entry.note ?? null,
    })
  } catch (error) {
    console.error("trade_live_journal write failed", error)
  }
}

/** The rails' own refusals, journalled like the exchange's. */
async function refuse(
  userId: string,
  walletId: string,
  marketKey: string,
  side: PaperSide | null,
  error: unknown
): Promise<never> {
  const message = error instanceof Error ? error.message : String(error)
  await journal(userId, walletId, marketKey, {
    action: "refused",
    side,
    note: message.replace(/^LIVE_(EXCHANGE|ORDER_REFUSED):/, ""),
  })
  throw error
}

export async function placeLiveOrder(
  userId: string,
  input: {
    walletId: string
    marketKey: string
    side: PaperSide
    px: number
    sz: number
    leverage: number
    reduceOnly: boolean
    tpPx: number | null
    slPx: number | null
    /** Smart rungs must rest; they may never turn into an untracked instant fill. */
    restingOnly?: boolean
  }
): Promise<PlaceOrderOutcome> {
  const row = await liveWallet(userId, input.walletId)
  if (row.status === "inactive") throw new Error("WALLET_INACTIVE")
  const protocol = getProtocol(row.protocol)

  try {
    const ref = checkedMarket(row, input.marketKey)
    // Today's price decides whether this waits or fills now — the same rule
    // the practice engine uses, so the two kinds of wallet never disagree
    // about what a click means.
    const prices = await protocol.markets.prices(row.network, [ref.marketId])
    const mark = prices.get(ref.marketId)
    if (mark === undefined) throw new Error("LIVE_NO_PRICE")
    const marketable = isMarketable(input.side, input.px, mark)
    if (input.restingOnly && marketable) {
      throw new Error("LIVE_SMART_ORDER_NOT_RESTING")
    }
    const entryPx = marketable ? mark : input.px

    // Protection must sit on the winning/losing side of the price the order
    // will actually fill at — validated here, before anything is signed.
    if (input.tpPx !== null) {
      const winning = input.side === "buy" ? input.tpPx > entryPx : input.tpPx < entryPx
      if (!winning) throw new Error("LIVE_TAKE_PROFIT_SIDE")
    }
    if (input.slPx !== null) {
      const losing = input.side === "buy" ? input.slPx < entryPx : input.slPx > entryPx
      if (!losing) throw new Error("LIVE_STOP_SIDE")
    }

    // Leverage is set only when this opens fresh; adding to a position
    // inherits what the position already runs at — the practice engine's
    // rule, kept identical for real money.
    const portfolio = await ordersOf(protocol).portfolio(row.network, row.address ?? "")
    const held = portfolio.positions.find((one) => one.marketId === ref.marketId)

    const outcome = await ordersOf(protocol).place(row.network, authFor(row), {
      marketId: ref.marketId,
      side: input.side,
      kind: input.restingOnly ? "postOnly" : marketable ? "market" : "limit",
      px: marketable ? mark : input.px,
      sz: input.sz,
      reduceOnly: input.reduceOnly,
      leverage: held ? null : input.leverage,
      tpPx: input.tpPx,
      slPx: input.slPx,
    })

    await journal(userId, row.id, input.marketKey, {
      action: outcome.status === "filled" ? "fill" : "placed",
      side: input.side,
      px: outcome.avgPx ?? entryPx,
      sz: outcome.filledSz ?? input.sz,
      note:
        outcome.status === "filled"
          ? "Filled straight away."
          : "Resting on the exchange.",
    })
    if (outcome.protection === "partial") {
      await journal(userId, row.id, input.marketKey, {
        action: "refused",
        side: input.side,
        note: outcome.protectionNote,
      })
    }
    return outcome
  } catch (error) {
    return await refuse(userId, row.id, input.marketKey, input.side, error)
  }
}

/**
 * Drags one resting real order to a new price.
 *
 * The exchange's modify action keeps the order itself alive — same id, same
 * size, same side — so there is no gap where the level has nothing on it.
 *
 * **One exchange call, nothing read first.** Size, side and reduce-only come
 * from the row on screen, because a drag has to land the moment the hand lets
 * go — reading the portfolio back just to learn what the browser was already
 * showing added seconds to every drop. The exchange still owns the truth: an
 * order that filled or died mid-drag is its refusal to give, and the refusal
 * path journals it like any other.
 */
export async function moveLiveOrder(
  userId: string,
  input: {
    walletId: string
    marketKey: string
    orderId: string
    px: number
    side: PaperSide
    sz: number
    reduceOnly: boolean
  }
): Promise<void> {
  const row = await liveWallet(userId, input.walletId)
  if (row.status === "inactive") throw new Error("WALLET_INACTIVE")
  const protocol = getProtocol(row.protocol)
  try {
    const ref = checkedMarket(row, input.marketKey)
    await ordersOf(protocol).modify(row.network, authFor(row), {
      marketId: ref.marketId,
      orderId: input.orderId,
      side: input.side,
      px: input.px,
      sz: input.sz,
      reduceOnly: input.reduceOnly,
    })
    await journal(userId, row.id, input.marketKey, {
      action: "placed",
      side: input.side,
      px: input.px,
      sz: input.sz,
      note: "Moved to a new price.",
    })
  } catch (error) {
    await refuse(userId, row.id, input.marketKey, null, error)
  }
}

export async function cancelLiveOrder(
  userId: string,
  input: { walletId: string; marketKey: string; orderId: string }
): Promise<void> {
  const row = await liveWallet(userId, input.walletId)
  const protocol = getProtocol(row.protocol)
  let side: PaperSide | null = null

  try {
    const ref = checkedMarket(row, input.marketKey)
    // Named for the journal: the order being cancelled, as the exchange
    // lists it right now. Gone already is its own honest refusal.
    const portfolio = await ordersOf(protocol).portfolio(row.network, row.address ?? "")
    const order = portfolio.orders.find((one) => one.orderId === input.orderId)
    if (!order) throw new Error("LIVE_ORDER_GONE")
    side = order.side

    await ordersOf(protocol).cancel(row.network, authFor(row), {
      marketId: ref.marketId,
      orderId: input.orderId,
    })
    await journal(userId, row.id, input.marketKey, {
      action: "cancelled",
      side: order.side,
      px: order.px,
      sz: order.sz,
    })
  } catch (error) {
    await refuse(userId, row.id, input.marketKey, side, error)
  }
}

/**
 * Cancels an exchange order this app has just placed and already knows by id.
 * Used to roll back a partly accepted multi-order action; unlike the normal
 * cancel path it does not depend on the next portfolio read seeing the order.
 */
export async function rollbackLiveOrder(
  userId: string,
  input: { walletId: string; marketKey: string; orderId: string }
): Promise<void> {
  const row = await liveWallet(userId, input.walletId)
  const protocol = getProtocol(row.protocol)
  const side: PaperSide | null = null

  try {
    const ref = checkedMarket(row, input.marketKey)
    await ordersOf(protocol).cancel(row.network, authFor(row), {
      marketId: ref.marketId,
      orderId: input.orderId,
    })
    await journal(userId, row.id, input.marketKey, {
      action: "cancelled",
      side,
      note: "A partly placed Smart order was rolled back.",
    })
  } catch (error) {
    await refuse(userId, row.id, input.marketKey, side, error)
  }
}

export async function closeLivePosition(
  userId: string,
  input: { walletId: string; marketKey: string }
): Promise<void> {
  const row = await liveWallet(userId, input.walletId)
  const protocol = getProtocol(row.protocol)
  let side: PaperSide | null = null

  try {
    const ref = checkedMarket(row, input.marketKey)
    const portfolio = await ordersOf(protocol).portfolio(row.network, row.address ?? "")
    const held = portfolio.positions.find((one) => one.marketId === ref.marketId)
    if (!held) throw new Error("LIVE_POSITION_GONE")
    side = held.szi > 0 ? "sell" : "buy"

    const closed = await ordersOf(protocol).close(row.network, authFor(row), {
      marketId: ref.marketId,
      szi: held.szi,
    })
    await journal(userId, row.id, input.marketKey, {
      action: "close",
      side,
      px: closed.avgPx ?? 0,
      sz: closed.filledSz ?? Math.abs(held.szi),
      note:
        closed.avgPx === null
          ? "The exchange accepted the close but reported no fill yet — check the position."
          : null,
    })
  } catch (error) {
    await refuse(userId, row.id, input.marketKey, side, error)
  }
}

export async function setLiveBrackets(
  userId: string,
  input: {
    walletId: string
    marketKey: string
    tpPx: number | null
    slPx: number | null
  }
): Promise<void> {
  const row = await liveWallet(userId, input.walletId)
  const protocol = getProtocol(row.protocol)
  let side: PaperSide | null = null

  try {
    const ref = checkedMarket(row, input.marketKey)
    const portfolio = await ordersOf(protocol).portfolio(row.network, row.address ?? "")
    const held = portfolio.positions.find((one) => one.marketId === ref.marketId)
    if (!held) throw new Error("LIVE_POSITION_GONE")
    side = held.szi > 0 ? "buy" : "sell"

    const long = held.szi > 0
    if (input.tpPx !== null) {
      const winning = long ? input.tpPx > held.entryPx : input.tpPx < held.entryPx
      if (!winning) throw new Error("LIVE_TAKE_PROFIT_SIDE")
    }
    if (input.slPx !== null) {
      const prices = await protocol.markets.prices(row.network, [ref.marketId])
      const mark = prices.get(ref.marketId)
      if (mark === undefined) throw new Error("LIVE_NO_PRICE")
      const ahead = long ? input.slPx < mark : input.slPx > mark
      if (!ahead) throw new Error("LIVE_STOP_SIDE")
    }

    await ordersOf(protocol).setBrackets(row.network, authFor(row), {
      marketId: ref.marketId,
      position: held,
      tpPx: input.tpPx,
      slPx: input.slPx,
    })
    await journal(userId, row.id, input.marketKey, {
      action: "brackets",
      side,
      note: describeBrackets(input.tpPx, input.slPx),
    })
  } catch (error) {
    await refuse(userId, row.id, input.marketKey, side, error)
  }
}

function describeBrackets(tpPx: number | null, slPx: number | null): string {
  const parts = [
    tpPx !== null ? `take profit at ${tpPx}` : "take profit removed",
    slPx !== null ? `stop at ${slPx}` : "stop removed",
  ]
  return `Protection set: ${parts.join(", ")}.`
}

/**
 * Everything every live wallet holds and has waiting, plus the journal and the
 * finished trades — the one read the polling hook makes. A wallet the exchange
 * will not answer for contributes nothing this tick and is named in
 * `unreachable`; it never blanks the others and never throws the read.
 */
export async function loadLivePortfolio(
  userId: string,
  wallets: readonly TradeWallet[]
): Promise<{
  positions: PaperPosition[]
  orders: PaperOrder[]
  fills: LiveFill[]
  trades: LiveTrade[]
  unreachable: string[]
}> {
  const live = wallets.filter(
    (wallet) => wallet.kind === "live" && wallet.address !== null
  )

  const now = Date.now()
  const positions: PaperPosition[] = []
  const orders: PaperOrder[] = []
  const unreachable: string[] = []

  await Promise.all(
    live.map(async (wallet) => {
      try {
        const portfolio = await ordersOf(getProtocol(wallet.protocol)).portfolio(
          wallet.network,
          wallet.address ?? ""
        )
        const rows = livePortfolioRows(wallet, portfolio, now)
        positions.push(...rows.positions)
        orders.push(...rows.orders)
        // The Journal's history rides along with this read. It has its own
        // rate limit inside and cannot throw, so a wallet still answers for
        // what it holds even when its history will not come.
        await sweepLiveFills(userId, wallet, portfolio)
      } catch {
        unreachable.push(wallet.id)
      }
    })
  )

  // `trade_live_journal` is deliberately NOT read here. It is still written on
  // every instruction and every refusal — it is the record you go digging
  // through when a real order has gone wrong, and the background engine trades
  // with nobody watching and no toast to see. Nothing on screen reads it, so
  // the poll does not pay for it either.
  const history = await loadLiveHistory(
    userId,
    live.map((wallet) => wallet.id)
  )

  return { positions, orders, ...history, unreachable }
}
