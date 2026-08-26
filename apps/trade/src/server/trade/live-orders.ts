import { randomUUID } from "node:crypto"

import { and, eq, sql } from "drizzle-orm"

import {
  marketKey as marketKeyOf,
  parseMarketKey,
  type NetworkId,
  type OrderAuth,
  type PlaceOrderOutcome,
  type WalletPosition,
} from "@/lib/protocols/contracts"
import {
  livePortfolioRows,
  type LiveJournalAction,
  type LiveRefusal,
} from "@/lib/trade/live"
import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"
import {
  isMarketable,
  liquidationPx,
  type TradeOrder,
  type TradePosition,
  type TradeSide,
} from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import type { GridPlan } from "@/lib/trade/grid"
import { reattributePairedStops } from "@/lib/trade/pairing"
import { readSmartPlan } from "@/lib/trade/smart-plan"
import { checkOrderMinimum, orderMinimumRefusal } from "@/lib/trade/market-info"
import { db } from "@/server/db"
import { credentialFor, walletCredentials } from "@/server/trade/wallet-auth"
import { getProtocol, ordersOf } from "@/server/protocols/registry"
import { marketRules } from "@/server/trade/market-rules"
import { openingMarginMode } from "@/server/protocols/order-settings"
import { pairedStopRefs } from "@/server/trade/smart-pairing"
import {
  loadLiveHistoryIfChanged,
  loadLiveRefusals,
  sweepIsWaitedFor,
  sweepWouldBeWaitedFor,
  sweepLiveFills,
  sweepSoon,
} from "@/server/trade/live-fills"
import {
  tradeLiveJournal,
  tradeSmartLadders,
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
    side: TradeSide | null
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

async function recordRefusal(
  userId: string,
  walletId: string,
  marketKey: string,
  side: TradeSide | null,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  await journal(userId, walletId, marketKey, {
    action: "refused",
    side,
    // The move codes carry a whole written sentence rather than a bare
    // reason, so stripping the code leaves the Journal reading properly.
    note: message.replace(
      /^LIVE_(EXCHANGE|ORDER_REFUSED|ORDER_TOO_SMALL|MOVE_REFUSED|MOVE_DOUBLED|BRACKET_REPLACE_PARTIAL|BRACKET_REPLACE_DOUBLED|LEVERAGE_TOO_HIGH|MARGIN_TOO_MUCH|MARGIN_PAST_STOP):/,
      ""
    ),
  })
}

/** The rails' own refusals, journalled like the exchange's. */
async function refuse(
  userId: string,
  walletId: string,
  marketKey: string,
  side: TradeSide | null,
  error: unknown
): Promise<never> {
  await recordRefusal(userId, walletId, marketKey, side, error)
  throw error
}

export async function placeLiveOrder(
  userId: string,
  input: {
    walletId: string
    marketKey: string
    side: TradeSide
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
  // Refused before any price is read or size worked out, so an exchange with
  // no order path says so plainly instead of failing deep inside `ordersOf`
  // with the market rules already fetched.
  if (protocol.capabilities?.orders === false) {
    throw new Error(`PROTOCOL_NO_ORDERS:${protocol.id}`)
  }

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
    const minimum = rules ? checkOrderMinimum(rules, entryPx, input.sz) : null
    const orderSize = minimum?.size ?? input.sz
    if (minimum?.tooSmall || orderSize <= 0) {
      const refusal =
        minimum ??
        checkOrderMinimum(
          {
            sizeDecimals: null,
            minOrderValueUsd: null,
            minOrderSize: null,
          },
          entryPx,
          input.sz
        )
      throw new Error(
        `LIVE_ORDER_TOO_SMALL:${orderMinimumRefusal(protocol.label, refusal)}`
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
      marginMode: held
        ? null
        : openingMarginMode(row.protocol, row.asterMarginMode),
      tpPx: input.tpPx,
      slPx: input.slPx,
    })

    await journal(userId, row.id, input.marketKey, {
      action: outcome.status === "filled" ? "fill" : "placed",
      side: input.side,
      px: outcome.avgPx ?? entryPx,
      sz: outcome.filledSz ?? orderSize,
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
    side: TradeSide
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
    side?: TradeSide
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
    // cached account answer. Send the cancel straight to the exchange. The
    // exchange will say if the order filled or disappeared first.
    await ordersOf(protocol).cancel(row.network, authFor(row), {
      marketId: ref.marketId,
      orderId: input.orderId,
    })
  } catch (error) {
    await recordRefusal(
      userId,
      row.id,
      input.marketKey,
      input.side ?? null,
      error
    )
    throw error
  }
  try {
    await journal(userId, row.id, input.marketKey, {
      action: "cancelled",
      side: input.side ?? null,
      px: input.px,
      sz: input.sz,
    })
  } catch (error) {
    console.error("live cancel journal failed", error)
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
  const side: TradeSide | null = null

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
  let side: TradeSide | null = null

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
    const rules = await marketRules(row.protocol, row.network, ref.marketId)

    const closed = await ordersOf(protocol).close(row.network, authFor(row), {
      marketId: ref.marketId,
      szi: held.szi,
      priceTick: rules?.priceTick ?? null,
      priceMultiplierUp: rules?.priceMultiplierUp ?? null,
      priceMultiplierDown: rules?.priceMultiplierDown ?? null,
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

/**
 * What one live wallet holds of one market, straight from the exchange.
 *
 * The exchange's own answer, not this app's copy of it, because the thing it
 * is used for is checking a size against what is really there. A part close
 * sized off a cached number could ask to sell more than the account holds, and
 * a sell bigger than the position is how a close becomes a short.
 *
 * Null means the position is not there. That is a real answer and the caller
 * decides what it means, rather than a throw from inside a read.
 */
export async function liveHeldPosition(
  userId: string,
  walletId: string,
  marketKey: string
): Promise<WalletPosition | null> {
  const row = await liveWallet(userId, walletId)
  const protocol = getProtocol(row.protocol)
  const ref = checkedMarket(row, marketKey)
  const portfolio = await ordersOf(protocol).portfolio(
    row.network,
    row.address ?? "",
    () => credentialFor(row)
  )
  return (
    portfolio.positions.find((one) => one.marketId === ref.marketId) ?? null
  )
}

/**
 * Changes the leverage on a position that is already open.
 *
 * **The exchange's answer is the only answer.** Nothing here writes a leverage
 * anywhere: the command goes out, and what the row shows afterwards comes from
 * the next portfolio read. So a venue that quietly clamps what was asked for
 * shows its own number rather than ours, which is the whole point of not
 * keeping a copy.
 *
 * Refused where the venue refuses it — Aster will not lower isolated leverage
 * on an open position — and that refusal reaches the screen in the venue's own
 * words through the journal's refusal path.
 */
export async function changeLiveLeverage(
  userId: string,
  input: {
    walletId: string
    marketKey: string
    leverage: number
    positionSide?: "long" | "short"
  }
): Promise<void> {
  const row = await liveWallet(userId, input.walletId)
  if (row.status === "inactive") throw new Error("WALLET_INACTIVE")
  const protocol = getProtocol(row.protocol)
  const change = ordersOf(protocol).setLeverage
  if (!change) throw new Error("LIVE_LEVERAGE_UNSUPPORTED")

  try {
    const ref = checkedMarket(row, input.marketKey)
    const asked = Math.max(1, Math.round(input.leverage))
    const rules = await marketRules(row.protocol, row.network, ref.marketId)
    if (rules?.maxLeverage != null && asked > rules.maxLeverage) {
      throw new Error(
        `LIVE_LEVERAGE_TOO_HIGH:${protocol.label} allows at most ${rules.maxLeverage}x on this market.`
      )
    }
    const portfolio = await ordersOf(protocol).portfolio(
      row.network,
      row.address ?? "",
      () => credentialFor(row)
    )
    const held = portfolio.positions.find(
      (one) =>
        one.marketId === ref.marketId &&
        (input.positionSide === undefined ||
          (input.positionSide === "long" ? one.szi > 0 : one.szi < 0))
    )
    if (!held) throw new Error("LIVE_POSITION_GONE")

    await change(row.network, authFor(row), {
      marketId: ref.marketId,
      leverage: asked,
      szi: held.szi,
    })
    await journal(userId, row.id, input.marketKey, {
      action: "brackets",
      side: held.szi > 0 ? "buy" : "sell",
      note: `Leverage asked to change from ${held.leverage}x to ${asked}x.`,
    })
  } catch (error) {
    await refuse(userId, row.id, input.marketKey, null, error)
  }
}

/**
 * Adds or takes back the cash behind one isolated position. Signed: negative
 * takes margin out.
 *
 * **Taking margin out is refused when it would bring the liquidation price
 * inside the stop.** A stop at $90 with liquidation moved to $92 means the
 * exchange takes the trade before the stop can fire, so the stop is no longer
 * the worst case and the trade is not the trade that was agreed to. The
 * refusal names both prices.
 *
 * The estimate uses this app's own formula, because the exchange will not tell
 * us where liquidation WOULD move to until after the money has moved. That is
 * said out loud on the window as well: what the row shows afterwards is the
 * exchange's own figure, read back.
 */
export async function changeLiveMargin(
  userId: string,
  input: {
    walletId: string
    marketKey: string
    dollars: number
    positionSide?: "long" | "short"
  }
): Promise<void> {
  const row = await liveWallet(userId, input.walletId)
  if (row.status === "inactive") throw new Error("WALLET_INACTIVE")
  const protocol = getProtocol(row.protocol)
  const adjust = ordersOf(protocol).adjustMargin
  if (!adjust) throw new Error("LIVE_MARGIN_UNSUPPORTED")

  try {
    const ref = checkedMarket(row, input.marketKey)
    if (!Number.isFinite(input.dollars) || input.dollars === 0) {
      throw new Error("LIVE_MARGIN_NOTHING")
    }
    const portfolio = await ordersOf(protocol).portfolio(
      row.network,
      row.address ?? "",
      () => credentialFor(row)
    )
    const held = portfolio.positions.find(
      (one) =>
        one.marketId === ref.marketId &&
        (input.positionSide === undefined ||
          (input.positionSide === "long" ? one.szi > 0 : one.szi < 0))
    )
    if (!held) throw new Error("LIVE_POSITION_GONE")

    if (input.dollars < 0) {
      if (held.marginUsed + input.dollars <= 0) {
        throw new Error(
          `LIVE_MARGIN_TOO_MUCH:This position is holding $${money(held.marginUsed)} of margin, and taking $${money(-input.dollars)} back would leave nothing behind it.`
        )
      }
      const rules = await marketRules(row.protocol, row.network, ref.marketId)
      const cap = rules?.maxLeverage ?? null
      const wouldBe = liquidationAfterMargin(
        held,
        held.marginUsed + input.dollars,
        cap
      )
      // **"Would bring it inside" and "is already inside" are different, and
      // only the first is refused.** A position whose stop already sits past
      // its liquidation price is in that state whatever anybody does next, so
      // blocking a withdrawal there traps the cash and fixes nothing. Both
      // sides use this app's own estimate: measuring "after" with our formula
      // and "now" with the exchange's would compare two arithmetics, and the
      // difference between them would read as a change the withdrawal caused.
      const nowAt = liquidationAfterMargin(held, held.marginUsed, cap)
      const inside = (px: number | null) =>
        px !== null &&
        held.slPx !== null &&
        (held.szi > 0 ? px >= held.slPx : px <= held.slPx)
      if (held.slPx !== null && inside(wouldBe) && !inside(nowAt)) {
        throw new Error(
          `LIVE_MARGIN_PAST_STOP:Taking that out moves the liquidation price to about $${money(wouldBe ?? 0)}, which the market reaches before the stop at $${money(held.slPx)} — the exchange would take the trade before the stop could. Take out less, or move the stop first.`
        )
      }
    }

    await adjust(row.network, authFor(row), {
      marketId: ref.marketId,
      szi: held.szi,
      dollars: input.dollars,
    })
    await journal(userId, row.id, input.marketKey, {
      action: "brackets",
      side: held.szi > 0 ? "buy" : "sell",
      note:
        input.dollars > 0
          ? `Asked to put $${money(input.dollars)} more margin behind the position.`
          : `Asked to take $${money(-input.dollars)} of margin back out.`,
    })
  } catch (error) {
    await refuse(userId, row.id, input.marketKey, null, error)
  }
}

/** Dollars inside a sentence, to two decimals. */
function money(value: number): string {
  return Math.abs(value).toFixed(2)
}

/**
 * Where liquidation would sit with a different amount of margin behind the
 * position — this app's estimate, never a figure from the exchange.
 *
 * The margin decides the effective leverage, and the leverage decides how far
 * price can travel before the stake is gone. `liquidationPx` holds that one
 * formula for the whole app, so this only works out the leverage to hand it.
 *
 * Null when the venue states no maximum leverage for the market: without it
 * there is no maintenance buffer to work from, and an estimate on a guess is
 * worse than no estimate. The stop check then does not fire, which leaves the
 * venue's own refusal as the backstop.
 */
function liquidationAfterMargin(
  held: WalletPosition,
  margin: number,
  maxLeverage: number | null
): number | null {
  const notional = Math.abs(held.szi) * held.entryPx
  if (!(margin > 0) || !(notional > 0) || maxLeverage === null) return null
  return liquidationPx({
    szi: held.szi,
    entryPx: held.entryPx,
    leverage: notional / margin,
    maxLeverage,
  })
}

/**
 * Everything one live wallet holds, market key and all, in ONE read.
 *
 * **The positions come back, not just their names, and that is the point.**
 * Emptying a wallet works through this list, and asking the exchange again for
 * each coin turned four positions into five whole-account reads — on the one
 * press somebody makes while a market is moving and the venue is already
 * rationing requests. One read, handed down.
 */
export async function liveHeldPositions(
  userId: string,
  walletId: string
): Promise<{ marketKey: string; held: WalletPosition }[]> {
  const row = await liveWallet(userId, walletId)
  const protocol = getProtocol(row.protocol)
  const portfolio = await ordersOf(protocol).portfolio(
    row.network,
    row.address ?? "",
    () => credentialFor(row)
  )
  return portfolio.positions
    .filter((one) => Math.abs(one.szi) > 0)
    .map((one) => ({
      marketKey: marketKeyOf({
        protocol: row.protocol,
        network: row.network,
        marketId: one.marketId,
      }),
      held: one,
    }))
}

/**
 * The order ids of grid-owned stops on this market — the fixed-size stop a
 * grid places for itself while a DCA ladder shares the coin.
 *
 * Read here, inside the bracket replace, rather than passed in by callers:
 * replacing a position's protection cancels every leg the exchange holds, and
 * every caller — the drag on the chart, the ladder's own engine pass, the ×
 * on a pill — must spare the grid's stop without having to know grids exist.
 * A hand moving the position's stop deletes the position's stop, not the
 * grid's.
 */
async function pairedGridStopOrderIds(
  userId: string,
  walletId: string,
  marketKey: string
): Promise<string[]> {
  const rows = await db
    .select({ plan: tradeSmartLadders.plan })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.marketKey, marketKey),
        eq(tradeSmartLadders.kind, "grid"),
        eq(tradeSmartLadders.status, "active")
      )
    )
  return rows.flatMap((row) => {
    const plan = readSmartPlan("grid", row.plan) as GridPlan | null
    return plan?.pairedStop ? [plan.pairedStop.orderId] : []
  })
}

export async function setLiveBrackets(
  userId: string,
  input: {
    walletId: string
    marketKey: string
    targets: Array<{ px: number; sz: number | null }>
    slPx: number | null
    /**
     * Coins the stop sells, or null/absent for the whole position. The same
     * rules as a target's size: more than is held is refused, and a size
     * that IS the whole position collapses back to null so the exchange
     * holds a stop that grows with the position.
     */
    slSz?: number | null
    /**
     * Replace exactly these protection orders and leave the rest standing —
     * how a grid swaps its own stop without touching the ladder's. Absent,
     * every protection leg is replaced except a paired grid's own stop,
     * which no ordinary replace may take off.
     */
    replaceOrderIds?: string[]
  }
): Promise<{ slOrderId: string | null }> {
  const row = await liveWallet(userId, input.walletId)
  const protocol = getProtocol(row.protocol)
  let side: TradeSide | null = null

  try {
    const ref = checkedMarket(row, input.marketKey)
    // Chart prices can carry more decimal places than the exchange accepts.
    // Normalize them from server-read rules before checking or sending them.
    const rules = await marketRules(row.protocol, row.network, ref.marketId)
    if (!rules) throw new Error("LIVE_MARKET")
    const roundPx = (px: number) =>
      protocol.markets.roundPx(px, rules.sizeDecimals, rules.priceTick)
    const targets = input.targets
      .map((target) => ({ ...target, px: roundPx(target.px) }))
      .sort((left, right) => left.px - right.px)
    const slPx = input.slPx === null ? null : roundPx(input.slPx)
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
    if (targets.length > 3) throw new Error("LIVE_TAKE_PROFIT_COUNT")
    for (const target of targets) {
      const winning =
        target.px > 0 &&
        (long ? target.px > held.entryPx : target.px < held.entryPx)
      if (!winning) throw new Error("LIVE_TAKE_PROFIT_SIDE")
    }
    if (targets.length > 1 && targets.some((target) => target.sz === null)) {
      throw new Error("LIVE_TAKE_PROFIT_LIST_SIZE")
    }
    const heldSz = Math.abs(held.szi)
    const coveredSz = targets.reduce(
      (sum, target) => sum + (target.sz ?? heldSz),
      0
    )
    if (targets.some((target) => target.sz !== null && !(target.sz > 0))) {
      throw new Error("LIVE_TAKE_PROFIT_SIZE")
    }
    if (coveredSz > heldSz * (1 + 1e-6)) {
      const targetsUsd = targets.reduce(
        (sum, target) => sum + (target.sz ?? heldSz) * target.px,
        0
      )
      throw new Error(
        `LIVE_TAKE_PROFIT_TOTAL:${targetsUsd}:${heldSz * held.entryPx}`
      )
    }
    // The stop's size, checked the way the target's already is. A stop for
    // more coins than are held would sell somebody else's; a stop for
    // exactly what is held is the whole-position stop and is sent as one, so
    // it keeps growing with the position instead of freezing at today's size.
    //
    // EXCEPT for a caller that owns its stop and named the order it is
    // replacing. A paired grid can hold the entire position for a while —
    // the ladder beneath it has simply not bought yet — and collapsing its
    // stop to the growing kind then would quietly stretch it over every
    // rung the ladder buys later. An owned stop keeps its exact size.
    let slSz = slPx === null ? null : (input.slSz ?? null)
    if (slSz !== null) {
      if (!(slSz > 0)) throw new Error("LIVE_STOP_SIZE")
      if (slSz > heldSz * (1 + 1e-6)) {
        throw new Error(
          `LIVE_STOP_TOTAL:${slSz * (slPx ?? 0)}:${heldSz * held.entryPx}`
        )
      }
      if (slSz >= heldSz * (1 - 1e-6) && input.replaceOrderIds === undefined) {
        slSz = null
      }
    }
    if (slPx !== null) {
      const prices = await protocol.markets.prices(row.network, [ref.marketId])
      const mark = prices.get(ref.marketId)
      if (mark === undefined) throw new Error("LIVE_NO_PRICE")
      const ahead = slPx > 0 && (long ? slPx < mark : slPx > mark)
      if (!ahead) throw new Error("LIVE_STOP_SIDE")
    }

    // Which legs this replace may take off. A grid running above a ladder
    // owns its stop outright: an ordinary replace spares it, and the grid's
    // own replace names exactly its old order and touches nothing else.
    const spared =
      input.replaceOrderIds === undefined
        ? new Set(
            await pairedGridStopOrderIds(
              userId,
              input.walletId,
              input.marketKey
            )
          )
        : null
    const replacing = spared
      ? held.protectionOrderIds.filter((id) => !spared.has(id))
      : held.protectionOrderIds.filter((id) =>
          (input.replaceOrderIds as string[]).includes(id)
        )

    const placed = await ordersOf(protocol).setBrackets(
      row.network,
      authFor(row),
      {
        marketId: ref.marketId,
        position: { ...held, protectionOrderIds: replacing },
        targets,
        slPx,
        slSz,
      }
    )
    await journal(userId, row.id, input.marketKey, {
      action: "brackets",
      side,
      note: describeBrackets(targets, slPx, slSz),
    })
    return { slOrderId: placed.slOrderId }
  } catch (error) {
    return await refuse(userId, row.id, input.marketKey, side, error)
  }
}

function describeBrackets(
  targets: Array<{ px: number; sz: number | null }>,
  slPx: number | null,
  slSz: number | null
): string {
  const parts = [
    targets.length > 0
      ? `take profit at ${targets
          .map(
            (target) =>
              `${target.px}${target.sz !== null ? ` selling ${target.sz}` : " selling the whole position"}`
          )
          .join(", ")}`
      : "take profits removed",
    slPx !== null
      ? `stop at ${slPx}${slSz !== null ? ` selling ${slSz}` : ""}`
      : "stop removed",
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
  wallets: readonly TradeWallet[],
  options: {
    /**
     * The stamp of the Journal history the caller already holds. When
     * nothing has happened since — no fill, no binned row, no new trigger —
     * the history comes back `null` and the caller keeps what it has, instead
     * of carrying up to four thousand rows every four seconds. The refusals
     * are small and always come back.
     */
    journalStamp?: string
    /** Each wallet's key, when the caller read the rows already. */
    credentials?: ReadonlyMap<string, () => string | null>
  } = {}
): Promise<{
  positions: TradePosition[]
  orders: TradeOrder[]
  fills: LiveFill[]
  trades: LiveTrade[]
  nextBefore: number | null
  /** True when the history is the caller's own, unchanged (see `journalStamp`). */
  journalUnchanged: boolean
  journalStamp: string
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
  const positions: TradePosition[] = []
  const orders: TradeOrder[] = []
  const unreachable: string[] = []

  // One read for every wallet's key, not one per wallet — or none at all
  // when the caller's wallet read brought them along.
  const credentials =
    options.credentials ??
    (await walletCredentials(
      userId,
      live.map((wallet) => wallet.id)
    ))

  // The Journal's history and the refusals come from this app's own tables,
  // so they can be read while the exchanges are being asked — unless a
  // wallet has just made a fill, in which case the history must be read
  // AFTER that wallet's sweep has written the fill down (see below).
  const walletIds = live.map((wallet) => wallet.id)
  // Peeked, not spent: the flag is spent below, only once the exchange has
  // answered, so a wallet that cannot be reached keeps its turn to wait.
  const anyWaited = live.some((wallet) =>
    sweepWouldBeWaitedFor(userId, wallet.id)
  )

  const readHistory = () =>
    Promise.all([
      loadLiveHistoryIfChanged(userId, walletIds, options.journalStamp),
      loadLiveRefusals(userId, walletIds),
    ])
  const early = anyWaited ? null : readHistory()

  // Which markets are running a grid above a ladder, so each stop can be
  // handed back to its owner — the exchange read names the oldest stop leg
  // as the position's, which is usually the grid's. One indexed query for
  // every wallet, empty for anyone not using the pairing.
  const pairedStops = await pairedStopRefs(userId, walletIds)

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
            const credential = credentials.get(wallet.id) ?? (() => null)
            const protocol = getProtocol(wallet.protocol)
            const readPortfolio =
              protocol.orders?.portfolio ?? protocol.account?.portfolio
            if (!readPortfolio) {
              throw new Error(`PROTOCOL_NO_PORTFOLIO:${protocol.id}`)
            }
            const portfolio = reattributePairedStops(
              await readPortfolio(
                wallet.network,
                wallet.address ?? "",
                credential
              ),
              pairedStops.get(wallet.id) ?? new Map()
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
  const [read, refusals] = await (early ?? readHistory())
  const history = read.history ?? {
    fills: [],
    trades: [],
    nextBefore: null,
  }

  return {
    positions,
    orders,
    ...history,
    journalUnchanged: read.history === null,
    journalStamp: read.stamp,
    refusals,
    unreachable,
  }
}
