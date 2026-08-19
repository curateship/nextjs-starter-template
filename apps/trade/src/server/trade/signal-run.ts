import { randomUUID } from "node:crypto"
import { and, eq, inArray } from "drizzle-orm"

import { parseMarketKey } from "@/lib/protocols/contracts"
import { INTERVAL_MS } from "@/server/trade/smart-engine"
import { MIN_ORDER_USD, floorSize } from "@/lib/trade/dca"
import type { TradeFlowRunSpec } from "@/lib/trade/flow-run"
import { indicatorSignals } from "@/lib/trade/indicators/registry"
import type { SignalPlan } from "@/lib/trade/signal-order"
import type { SignalRow } from "@/server/trade/smart-signals"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { tradeSmartLadders } from "@/server/trade/schema"
import { marketRules } from "@/server/trade/market-rules"

/**
 * Deciding what the arrows say, one coin at a time.
 *
 * **This is not a trading engine and must never become one.** It reads candles,
 * asks the indicators what they call, and writes a `trade_smart_ladders` row of
 * kind `signal` — or moves an existing one into selling. Everything that
 * actually asks an exchange for a price is `smart-signals.ts`, driven by the
 * per-second engine that already runs with the browser closed. If a change here
 * starts to look like order handling, it belongs there.
 *
 * ## Why it looks at one coin at a time
 *
 * Because candles cost. Hyperliquid charges about 28 request-weight for a read
 * of 500 bars against an allowance of roughly 1,200 a minute for the whole
 * address. Reading a hundred coins in one pass is three thousand weight in a
 * single second — the whole minute's budget and more, spent in a burst that
 * gets everything after it refused. That is not a hypothetical: it is written
 * up in `live-smart-orders.ts` beside the same gate, from the time it happened.
 *
 * So one read per pass, paced, taking the coin looked at longest ago. A hundred
 * coins come round in about four minutes, and an arrow on a four-hour candle
 * that is four minutes old has lost nothing at all. On one-minute candles it
 * very much has, which is the honest limit of watching a long list this way.
 */

/** How often one coin's candles may be read, across every flow. */
const CANDLE_EVERY_MS = 2_500

/**
 * How many bars to read, and so how much history the indicators get.
 *
 * Enough for the deepest search a setting allows (500 candles) plus room for
 * the levels before it, because an indicator that only ever saw its own search
 * window would have no earlier level to compare against and its
 * with-the-trend rule would never say no.
 */
const SIGNAL_BARS = 600

/** When a coin's candles were last read, so the pace holds across flows. */
let lastCandleAt = 0

/** Test support: forgets the pace, so a test need not wait 2.5 seconds. */
export function resetSignalPacing(): void {
  lastCandleAt = 0
}

/**
 * Whether a coin may be looked at yet.
 *
 * Asked by the caller BEFORE it reads the database for what each coin is
 * holding. Without it, every switched-on signals flow ran that query once a
 * second forever to be told there was nothing to do — the pass is paced at one
 * look every two and a half seconds, so three passes in four were pure cost.
 */
export function signalReadDue(now: number): boolean {
  return now - lastCandleAt >= CANDLE_EVERY_MS
}

export type SignalPassInput = {
  userId: string
  wallet: TradeWallet
  spec: TradeFlowRunSpec
  /** The run this pass belongs to, stamped onto anything it opens. */
  flowRunId: string
  /** What each coin is holding right now, keyed by market key. */
  working: ReadonlyMap<string, SignalRow>
  /** When each coin was last looked at, so the rotation is fair. */
  lookedAt: Readonly<Record<string, number>>
  /**
   * The newest arrow this flow has already acted on, per coin.
   *
   * **Without it every pass buys the same coin again.** An arrow stays the
   * newest one for as long as its candle is the last to have confirmed
   * anything, which on a four-hour chart is hours. Kept on the run rather than
   * on the smart order because the order is gone the moment the trade is —
   * and the arrow that started it is exactly what must not be acted on twice.
   */
  acted: Readonly<Record<string, number>>
  now: number
}

/**
 * What one pass did, and — when it did something — **which arrow it did it on**.
 *
 * `at` is the arrow's own candle time, never the moment it was acted on. The
 * caller writes it into the run's `acted` record, and writing a wall clock
 * there instead silently skips the very next candle's arrow: an arrow is only
 * visible once its candle has closed, so the clock at that moment is already
 * past the following candle's open time.
 */
export type SignalPassOutcome =
  /** Nothing happened — no read was due, or the coin had nothing to say. */
  | { did: "nothing"; marketKey: string | null; at?: undefined }
  /** A buy arrow started a trade on this coin. */
  | { did: "opened"; marketKey: string; at: number }
  /** A sell arrow told an existing trade to get out. */
  | { did: "closing"; marketKey: string; at: number }

/**
 * One pass of a signals flow: look at one coin, and act if it said something.
 *
 * Safe to repeat. A coin that already has a smart order cannot get a second
 * one — the same "one live smart order per coin per wallet" rule that keeps a
 * ladder and a grid off each other's toes — and an arrow already acted on is
 * skipped by its time.
 */
export async function advanceSignalFlow(
  input: SignalPassInput,
  database: CustomShellDb = db
): Promise<SignalPassOutcome> {
  const { spec, now } = input
  if (spec.strategy.kind !== "signals") return { did: "nothing", marketKey: null }
  if (!signalReadDue(now)) return { did: "nothing", marketKey: null }

  // A coin mid-buy or mid-sell is the engine's business this second, not ours:
  // it is already chasing a price and another arrow cannot change that.
  // Everything else is worth a look — including a coin being held, which is
  // waiting for exactly the sell arrow this pass might find.
  const candidates = spec.marketKeys.filter((key) => {
    const working = input.working.get(key)
    return !working || working.plan.phase === "holding"
  })
  if (candidates.length === 0) return { did: "nothing", marketKey: null }

  // Longest since it was looked at, so a long list comes all the way round
  // rather than the same handful being asked over and over.
  const marketKey = candidates.reduce((oldest, key) =>
    (input.lookedAt[key] ?? 0) < (input.lookedAt[oldest] ?? 0) ? key : oldest
  )
  const ref = parseMarketKey(marketKey)
  if (!ref) return { did: "nothing", marketKey }

  lastCandleAt = now
  const barMs = INTERVAL_MS[spec.strategy.interval]
  const bars = await getProtocol(spec.protocol)
    .markets.candles(
      spec.network,
      ref.marketId,
      spec.strategy.interval,
      now - SIGNAL_BARS * barMs
    )
    // A coin too new to have history, or an exchange that would not answer.
    // Either way there is nothing to read arrows off, which the caller treats
    // as this coin simply having said nothing.
    .catch(() => [])

  // The bar still being filled in is left out. An arrow prints on a candle that
  // CLOSED, so counting a live one would call a trade off a shape that has not
  // finished happening and can still turn into something else.
  const closed = bars.filter((bar) => bar.openTime + barMs <= now)
  if (closed.length === 0) return { did: "nothing", marketKey }

  const called = indicatorSignals(spec.strategy.indicators, closed)
  const newest = called.at(-1)
  if (!newest) return { did: "nothing", marketKey }

  const working = input.working.get(marketKey)

  // Already acted on, by this flow or by the trade currently running on it.
  const actedAt = Math.max(
    input.acted[marketKey] ?? 0,
    working?.plan.signalAt ?? 0
  )
  if (newest.time <= actedAt) return { did: "nothing", marketKey }

  if (working) {
    // Holding it, and the arrow says get out. Nothing is sent from here: the
    // phase change is what tells the engine to start asking for a price.
    if (newest.side !== "sell") return { did: "nothing", marketKey }
    await database
      .update(tradeSmartLadders)
      .set({
        plan: { ...working.plan, phase: "selling", signalAt: newest.time },
        updatedAt: new Date(now),
      })
      .where(
        and(
          eq(tradeSmartLadders.userId, input.userId),
          eq(tradeSmartLadders.id, working.id)
        )
      )
    return { did: "closing", marketKey, at: newest.time }
  }

  // Nothing held, so only a buy arrow means anything. A sell arrow on a coin
  // this flow never bought is a true statement about a coin it has no opinion
  // on, and doing nothing about it is the whole of the right answer.
  if (newest.side !== "buy") return { did: "nothing", marketKey }

  await openSignalTrade(input, marketKey, newest.time, database)
  return { did: "opened", marketKey, at: newest.time }
}

/**
 * Writes the row that starts one coin's trade. It places no order.
 *
 * The engine's next pass sees a plan in `buying` with nothing resting and asks
 * for a price. Splitting it that way is what keeps this file free of order
 * handling — and it means a crash between the two costs a repeated pass rather
 * than an order nothing remembers placing.
 */
async function openSignalTrade(
  input: SignalPassInput,
  marketKey: string,
  signalAt: number,
  database: CustomShellDb
): Promise<void> {
  const { spec, now } = input
  if (spec.strategy.kind !== "signals") return
  const ref = parseMarketKey(marketKey)
  if (!ref) throw new Error("PAPER_MARKET")

  const protocol = getProtocol(spec.protocol)
  const prices = await protocol.markets.prices(spec.network, [ref.marketId])
  const mark = prices.get(ref.marketId)
  if (mark === undefined || !(mark > 0)) throw new Error("PAPER_NO_PRICE")

  // A market the exchange does not list is refused, never guessed at — the
  // same rule the ladder's placement follows.
  const rules = await marketRules(spec.protocol, spec.network, ref.marketId)
  if (!rules) throw new Error("PAPER_MARKET")

  const stakeUsd = (spec.capUsd * spec.strategy.stakePct) / 100
  // Refused here rather than by the exchange in ten seconds' time, so the coin
  // says "too small" in the waiting list instead of silently never buying.
  const sz = floorSize(stakeUsd / mark, rules.sizeDecimals)
  if (sz <= 0 || mark * sz < MIN_ORDER_USD) {
    throw new Error("SMART_RUNG_TOO_SMALL")
  }

  const plan: SignalPlan = {
    // The live price, not the candle's close: the two are usually near each
    // other and only one of them is a price we could actually have had.
    signalPx: mark,
    signalAt,
    chaseGiveUp: spec.strategy.chaseGiveUp,
    stakeUsd,
    sizeDecimals: rules.sizeDecimals,
    priceTick: rules.priceTick,
    // No leverage on a signal trade: it spends the cash it was given. One is
    // the honest fallback for a market that will not say its own limit.
    maxLeverage: rules.maxLeverage ?? 1,
    phase: "buying",
    orderId: null,
    orderPx: null,
    chasedAt: 0,
    chases: 0,
    startedAt: now,
  }

  await database.insert(tradeSmartLadders).values({
    userId: input.userId,
    id: randomUUID(),
    walletId: input.wallet.id,
    marketKey,
    kind: "signal",
    status: "active",
    plan,
    // No order has been sent yet — the engine's next pass asks for a price —
    // so this row is the only thing that can say whose trade it is.
    flowRunId: input.flowRunId,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  })
}

/** Every signal order a wallet is working right now, keyed by coin. */
export async function workingSignals(
  userId: string,
  walletId: string,
  marketKeys: readonly string[],
  database: CustomShellDb = db
): Promise<Map<string, SignalRow>> {
  const working = new Map<string, SignalRow>()
  if (marketKeys.length === 0) return working
  const rows = await database
    .select({
      id: tradeSmartLadders.id,
      marketKey: tradeSmartLadders.marketKey,
      kind: tradeSmartLadders.kind,
      plan: tradeSmartLadders.plan,
    })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.status, "active"),
        inArray(tradeSmartLadders.marketKey, [...marketKeys])
      )
    )
  for (const row of rows) {
    // Only this flow's own kind. A ladder somebody placed by hand on one of
    // these coins is not a signal trade and must not be read as one — but it
    // does mean the coin is taken, which the caller checks separately.
    if (row.kind !== "signal") continue
    const plan = row.plan as SignalPlan
    working.set(row.marketKey, { id: row.id, marketKey: row.marketKey, plan })
  }
  return working
}
