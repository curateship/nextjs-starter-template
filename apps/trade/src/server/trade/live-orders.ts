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
  type LiveRefusal,
} from "@/lib/trade/live"
import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"
import {
  isMarketable,
  type PaperOrder,
  type PaperPosition,
  type PaperSide,
} from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import { floorSize } from "@/lib/trade/dca"
import {
  minimumOrderDollars,
  minimumOrderUsd,
  orderDollars,
} from "@/lib/trade/market-info"
import { db } from "@/server/db"
import { credentialFor, walletCredential } from "@/server/trade/wallet-auth"
import { getProtocol, ordersOf } from "@/server/protocols/registry"
import { marketRules } from "@/server/trade/market-rules"
import {
  loadLiveHistory,
  loadLiveRefusals,
  sweepIsWaitedFor,
  sweepLiveFills,
  sweepSoon,
} from "@/server/trade/live-fills"
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
async function allocateNonce(
  address: string,
  network: NetworkId
): Promise<number> {
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
async function liveWallet(
  userId: string,
  walletId: string
): Promise<LiveWalletRow> {
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
  const credential = credentialFor(row)
  if (!credential) throw new Error("LIVE_WALLET_KEY")
  return {
    agentKey: credential,
    accountAddress: row.address ?? "",
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
    // The move codes carry a whole written sentence rather than a bare
    // reason, so stripping the code leaves the Journal reading properly.
    note: message.replace(
      /^LIVE_(EXCHANGE|ORDER_REFUSED|MOVE_REFUSED|MOVE_DOUBLED):/,
      ""
    ),
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
    marginMode?: "cross" | "isolated" | null
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
    const rules = await marketRules(row.protocol, row.network, ref.marketId)
    const orderSize = rules
      ? floorSize(input.sz, rules.sizeDecimals)
      : input.sz
    const floor = rules
      ? minimumOrderUsd(
          {
            minOrderValueUsd: rules.minOrderValueUsd ?? null,
            minOrderSize: rules.minOrderSize ?? null,
          },
          entryPx
        )
      : null
    const asked = entryPx * orderSize
    if (
      orderSize <= 0 ||
      (rules?.minOrderSize != null &&
        orderSize + 1e-12 < rules.minOrderSize) ||
      (floor !== null && asked + 1e-9 < floor)
    ) {
      const smallest =
        floor ?? entryPx * 10 ** -(rules?.sizeDecimals ?? 0)
      throw new Error(
        `LIVE_ORDER_TOO_SMALL:${protocol.label}'s smallest order here is $${minimumOrderDollars(smallest)}, and this order is $${orderDollars(entryPx * input.sz)}.`
      )
    }

    // Protection must sit on the winning/losing side of the price the order
    // will actually fill at — validated here, before anything is signed.
    if (input.tpPx !== null) {
      const winning =
        input.side === "buy" ? input.tpPx > entryPx : input.tpPx < entryPx
      if (!winning) throw new Error("LIVE_TAKE_PROFIT_SIDE")
    }
    if (input.slPx !== null) {
      const losing =
        input.side === "buy" ? input.slPx < entryPx : input.slPx > entryPx
      if (!losing) throw new Error("LIVE_STOP_SIDE")
    }

    // Leverage is set only when this opens fresh; adding to a position
    // inherits what the position already runs at — the practice engine's
    // rule, kept identical for real money.
    const portfolio = await ordersOf(protocol).portfolio(
      row.network,
      row.address ?? "",
      () => credentialFor(row)
    )
    const held = portfolio.positions.find(
      (one) => one.marketId === ref.marketId
    )

    const outcome = await ordersOf(protocol).place(row.network, authFor(row), {
      marketId: ref.marketId,
      side: input.side,
      kind: input.restingOnly ? "postOnly" : marketable ? "market" : "limit",
      px: marketable ? mark : input.px,
      priceTick: rules?.priceTick ?? null,
      priceMultiplierUp: rules?.priceMultiplierUp ?? null,
      priceMultiplierDown: rules?.priceMultiplierDown ?? null,
      sz: orderSize,
      reduceOnly: input.reduceOnly,
      leverage: held ? null : input.leverage,
      marginMode: held ? null : (input.marginMode ?? null),
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
 * **The level is never left with nothing on it.** Hyperliquid and Phemex have
 * an amend command, so the order itself stays alive — same id, same size, new
 * price. KuCoin has none, so its own `modify` puts the new order on before
 * taking the old one off and the level is covered twice for a moment instead.
 * Either way there is no gap, which is the rule in `trading-rules.md`.
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
  input: {
    walletId: string
    marketKey: string
    orderId: string
    side?: PaperSide
    px?: number
    sz?: number
  }
): Promise<void> {
  const row = await liveWallet(userId, input.walletId)
  const protocol = getProtocol(row.protocol)

  try {
    const ref = checkedMarket(row, input.marketKey)
    // The screen already has the exchange's order id. Asking for the whole
    // account again before cancelling made a valid cancel depend on a second,
    // cached account answer. Send the cancel straight to the exchange. Aster
    // the exchange will say if the order filled or disappeared first.
    await ordersOf(protocol).cancel(row.network, authFor(row), {
      marketId: ref.marketId,
      orderId: input.orderId,
    })
    await journal(userId, row.id, input.marketKey, {
      action: "cancelled",
      side: input.side ?? null,
      px: input.px,
      sz: input.sz,
    })
  } catch (error) {
    await refuse(userId, row.id, input.marketKey, input.side ?? null, error)
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
): Promise<boolean> {
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
    return true
  } catch (error) {
    // **Whether it cancelled is the answer, not a thrown fit.** A cancel that
    // failed usually failed because the order had already FILLED — and a
    // caller about to place a replacement must know that, or it buys the
    // same thing twice. This used to rethrow, and the throw landed in the
    // smart-order recovery path, which "restored" the cancelled original by
    // PLACING IT AGAIN — an order that was never cancelled got a sibling.
    // So the refusal is journalled and the answer is returned, calmly.
    const message = error instanceof Error ? error.message : String(error)
    await journal(userId, row.id, input.marketKey, {
      action: "refused",
      side,
      note: message.replace(/^LIVE_(EXCHANGE|ORDER_REFUSED):/, ""),
    })
    return false
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
    const portfolio = await ordersOf(protocol).portfolio(
      row.network,
      row.address ?? "",
      () => credentialFor(row)
    )
    const held = portfolio.positions.find(
      (one) => one.marketId === ref.marketId
    )
    if (!held) throw new Error("LIVE_POSITION_GONE")
    side = held.szi > 0 ? "sell" : "buy"

    const closed = await ordersOf(protocol).close(row.network, authFor(row), {
      marketId: ref.marketId,
      szi: held.szi,
    })
    // The Journal row for this trade is built from the fill this close just
    // made, so the next read must not sit behind the idle wait.
    sweepSoon(userId, row.id)
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
    /** Coins the target sells; null or the whole position sells everything. */
    tpSz?: number | null
    slPx: number | null
  }
): Promise<void> {
  const row = await liveWallet(userId, input.walletId)
  const protocol = getProtocol(row.protocol)
  let side: PaperSide | null = null

  try {
    const ref = checkedMarket(row, input.marketKey)
    const portfolio = await ordersOf(protocol).portfolio(
      row.network,
      row.address ?? "",
      () => credentialFor(row)
    )
    const held = portfolio.positions.find(
      (one) => one.marketId === ref.marketId
    )
    if (!held) throw new Error("LIVE_POSITION_GONE")
    side = held.szi > 0 ? "buy" : "sell"

    const long = held.szi > 0
    if (input.tpPx !== null) {
      const winning = long
        ? input.tpPx > held.entryPx
        : input.tpPx < held.entryPx
      if (!winning) throw new Error("LIVE_TAKE_PROFIT_SIDE")
    }
    // A size only means something on a target that exists, and it may not be
    // more than is held. Selling everything is what null already says.
    let tpSz = input.tpPx === null ? null : (input.tpSz ?? null)
    if (tpSz !== null) {
      if (!(tpSz > 0) || tpSz > Math.abs(held.szi) * (1 + 1e-6)) {
        throw new Error("LIVE_TAKE_PROFIT_SIZE")
      }
      if (tpSz >= Math.abs(held.szi) * (1 - 1e-6)) tpSz = null
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
      tpSz,
      slPx: input.slPx,
    })
    await journal(userId, row.id, input.marketKey, {
      action: "brackets",
      side,
      note: describeBrackets(input.tpPx, tpSz, input.slPx),
    })
  } catch (error) {
    await refuse(userId, row.id, input.marketKey, side, error)
  }
}

function describeBrackets(
  tpPx: number | null,
  tpSz: number | null,
  slPx: number | null
): string {
  const parts = [
    tpPx !== null
      ? `take profit at ${tpPx}${tpSz !== null ? ` selling ${tpSz}` : ""}`
      : "take profit removed",
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
/**
 * How long one wallet's read may take before the screen stops waiting on it.
 *
 * Giving up does not cancel the work — it only stops the panel hanging on
 * it, and the request already in flight warms the caches the next poll uses.
 * The wallet says "could not be reached", which is both true and something a
 * person can act on, where a spinner that never ends is neither.
 *
 * Eight seconds, because this is the wait a person watches. One wallet that
 * cannot answer in that time must not hold up the ones that can — it keeps
 * the figures it last had, marked as a moment old, and the next poll is four
 * seconds away.
 */
const WALLET_READ_DEADLINE_MS = 8_000

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error("LIVE_WALLET_SLOW")), ms).unref?.()
    ),
  ])
}

export async function loadLivePortfolio(
  userId: string,
  wallets: readonly TradeWallet[]
): Promise<{
  positions: PaperPosition[]
  orders: PaperOrder[]
  fills: LiveFill[]
  trades: LiveTrade[]
  /** The last refusal on each market, so a stuck level can say why. */
  refusals: LiveRefusal[]
  unreachable: string[]
}> {
  const live = wallets.filter(
    (wallet) =>
      wallet.kind === "live" &&
      wallet.status === "active" &&
      wallet.address !== null
  )

  const now = Date.now()
  const positions: PaperPosition[] = []
  const orders: PaperOrder[] = []
  const unreachable: string[] = []

  await Promise.all(
    live.map(async (wallet) => {
      try {
        // One wallet may not hold the whole screen up. A venue that is slow
        // or rationing us can take longer than anyone will sit and watch, and
        // the panel already has an honest way to say so — this wallet is
        // reported unreachable and the next poll tries again, rather than
        // every other wallet's figures waiting behind it.
        await withDeadline(
          (async () => {
            const credential = await walletCredential(userId, wallet.id)
            const protocol = getProtocol(wallet.protocol)
            const readPortfolio =
              protocol.orders?.portfolio ?? protocol.account?.portfolio
            if (!readPortfolio) {
              throw new Error(`PROTOCOL_NO_PORTFOLIO:${protocol.id}`)
            }
            const portfolio = await readPortfolio(
              wallet.network,
              wallet.address ?? "",
              credential
            )
            const rows = livePortfolioRows(wallet, portfolio, now)
            positions.push(...rows.positions)
            orders.push(...rows.orders)
            // The Journal's history is kept up to date ALONGSIDE this read, not
            // inside it. What the panel draws comes from `trade_live_fills`,
            // which the sweep writes into — so waiting for the sweep only made
            // the whole panel sit on a spinner while an exchange was asked about
            // months of old trades nobody was looking at. It cannot throw, it
            // paces itself, and whatever it brings in shows on the next poll.
            // ...unless this wallet has just made a fill. Then the row the
            // Journal is about to draw comes from that very sweep, and answering
            // without it means the trade shows a poll later and reads as not
            // having been recorded at all.
            if (protocol.orders) {
              if (sweepIsWaitedFor(userId, wallet.id)) {
                await sweepLiveFills(userId, wallet, portfolio, credential)
              } else {
                void sweepLiveFills(userId, wallet, portfolio, credential)
              }
            }
          })(),
          WALLET_READ_DEADLINE_MS
        )
      } catch {
        unreachable.push(wallet.id)
      }
    })
  )

  // **The refusals are read now.** For a long time `trade_live_journal` was
  // written and read by nothing, on the reasoning that a person could go
  // digging when an order had gone wrong. Digging needs a database client, so
  // in practice the answer was invisible: a Phemex level refused twenty times
  // in eighteen minutes still drew as "waiting", and the only way to learn
  // why was to query the table by hand. One refusal per market, six hours
  // back — see `loadLiveRefusals`.
  const walletIds = live.map((wallet) => wallet.id)
  const [history, refusals] = await Promise.all([
    loadLiveHistory(userId, walletIds),
    loadLiveRefusals(userId, walletIds),
  ])

  return { positions, orders, ...history, refusals, unreachable }
}
