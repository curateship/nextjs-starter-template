import type {
  CandleBar,
  CandleInterval,
  NetworkId,
  ProtocolId,
} from "@/lib/protocols/contracts"
import {
  BASE_STOP_BAR_MS,
  baseStopDetection,
  ladderExitLevels,
  type DcaParams,
} from "@/lib/trade/dca"
import { baseInForce } from "@/lib/trade/indicators/base"
import {
  paperAccountFigures,
  positionMargin,
  type PaperCosts,
  type PaperJournalEntry,
  type PaperPosition,
} from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import { getProtocol } from "@/server/protocols/registry"
import type { MarketRules } from "@/server/trade/market-rules"
import { armLadder } from "@/server/trade/backtest/arm"
import {
  fill,
  freeCash,
  MAX_OPEN_ORDERS,
  settleMarket,
  type WalletBook,
} from "@/server/trade/paper"
import {
  advanceOne,
  ladderBarsKey,
  type LadderBars,
  type LadderEngineDeps,
  type LadderRow,
} from "@/server/trade/smart-ladders"

/**
 * Replaying a strategy over stored candles — the backtest itself.
 *
 * **It runs the real engine.** Nothing here re-implements what a ladder does:
 * bars go through `settleMarket`, ladders go through `advanceOne`, and a new
 * ladder is drafted by the same function the right-click window uses. The two
 * database touches the ladder engine has — writing an order, saving a plan —
 * are handed in as functions that keep the answer in memory, which is the seam
 * that makes a replay possible without a second copy of the strategy to keep in
 * step with the first.
 *
 * Three rules make two runs of the same flow identical:
 *
 * - **One pot.** Every coin shares one wallet book, so two coins can never
 *   spend the same money. That is what running this for real would be like.
 * - **A written order.** Bar times are walked oldest first, and coins sharing a
 *   bar are handled in alphabetical order of market key. Feeding the coins in a
 *   different order changes nothing.
 * - **No clock, no dice.** Every moment comes from a bar's own time, and order
 *   ids are counted rather than rolled.
 */

/**
 * How many bars the walk covers before it looks up: reports where it has got
 * to, and checks whether somebody pressed Stop.
 *
 * Fifty is about a dozen checks over a ninety-day run at 4h. Far larger and a
 * short run would never check at all, so Stop would do nothing on exactly the
 * runs where it is quickest to press.
 */
const CHUNK_BARS = 50

export type BacktestCoin = {
  marketKey: string
  symbol: string
  rules: MarketRules
  /** The bars the strategy is walked over — the window only, warm-up excluded. */
  bars: readonly CandleBar[]
  /** 4h bars from before the window as well, for the base rule. */
  baseBars: readonly CandleBar[]
}

export type BacktestRunInput = {
  protocol: ProtocolId
  network: NetworkId
  startingUsd: number
  costs: PaperCosts
  params: DcaParams
  interval: CandleInterval
  coins: readonly BacktestCoin[]
  from: number
  to: number
}

export type BacktestRunHooks = {
  /** Somebody pressed Stop. Checked between chunks; the walk ends where it is. */
  shouldStop?: () => Promise<boolean> | boolean
  /** How far through the walk, 0 to 1, reported between chunks. */
  onProgress?: (fraction: number) => Promise<void> | void
}

/** A fill, plus which ladder step it was — the chart labels its arrows with it. */
export type BacktestEngineFill = PaperJournalEntry & {
  /** Counted from 0, or null when this fill was not one of the rungs. */
  rung: number | null
}

export type BacktestCoinTrades = {
  marketKey: string
  fills: BacktestEngineFill[]
  /** What was still held when the walk ended, or null. */
  openAtEnd: PaperPosition | null
  /** The last price this coin had inside the window. */
  lastPx: number | null
  /** The first price this coin had inside the window. */
  firstPx: number | null
}

export type BacktestRunOutcome = {
  coins: BacktestCoinTrades[]
  /** The combined pot at every bar time, in order. */
  equity: Array<{ t: number; usd: number }>
  /** How much was in trades at each bar time, for the money-in-play figures. */
  inPlay: number[]
  endingUsd: number
  /** True when Stop ended the walk before the window did. */
  stoppedEarly: boolean
  /** The bar time the walk actually reached. */
  reachedTo: number
}

/** A wallet that exists only for the length of one run and is never stored. */
function backtestWallet(input: BacktestRunInput): TradeWallet {
  return {
    id: "backtest",
    label: "Backtest",
    kind: "paper",
    status: "active",
    protocol: input.protocol,
    network: input.network,
    startingBalance: input.startingUsd,
    address: null,
    hasKey: false,
    keyValidUntil: null,
  }
}

export async function runBacktest(
  input: BacktestRunInput,
  hooks: BacktestRunHooks = {}
): Promise<BacktestRunOutcome> {
  const protocol = getProtocol(input.protocol)
  const barMs = protocol.markets.intervalMs(input.interval)
  const detection = baseStopDetection()

  const book: WalletBook = {
    wallet: backtestWallet(input),
    costs: input.costs,
    cash: input.startingUsd,
    positions: new Map(),
    orders: [],
    fills: [],
    touchedMarkets: new Set(),
    goneOrderIds: new Set(),
    addedOrders: [],
  }

  // Alphabetical, once, and everything downstream walks this list. Two runs
  // fed the same coins in different orders take the same path through the
  // same pot, which is the only reason their answers can be compared.
  // Room for every coin in the run to hold a full ladder, plus its exits.
  // The practice wallet's fifty is a guard against a person forgetting orders
  // on a chart; applied to a replay it silently capped the run at the first
  // fourteen coins in the alphabet and left the rest untested.
  const orderCap =
    input.coins.length * (input.params.rungs.length + 2) + MAX_OPEN_ORDERS

  const coins = [...input.coins].sort((left, right) =>
    left.marketKey.localeCompare(right.marketKey)
  )
  const byKey = new Map(coins.map((coin) => [coin.marketKey, coin]))

  // Order ids are counted rather than rolled: nothing inside a run may read a
  // random number, or two identical runs stop being identical.
  let nextId = 0
  const nextOrderId = () => `backtest-order-${(nextId += 1)}`

  /** Every ladder still working, one per coin at most. */
  const ladders = new Map<string, LadderRow>()

  const deps: LadderEngineDeps = {
    fill,
    dropOrder: (heldBook, orderId) => {
      heldBook.orders = heldBook.orders.filter((order) => order.id !== orderId)
      heldBook.goneOrderIds.add(orderId)
    },
    freeCash,
    insertOrder: async (order) => {
      const id = nextOrderId()
      book.orders.push({
        id,
        walletId: book.wallet.id,
        marketKey: order.marketKey,
        side: order.side,
        px: order.px,
        sz: order.sz,
        leverage: order.leverage,
        maxLeverage: order.maxLeverage,
        reduceOnly: order.reduceOnly,
        tpPx: null,
        slPx: null,
        // The rung's own exit, so it rests the instant the buy fills instead
        // of waiting for the candle to finish.
        exitPx: order.exitPx ?? null,
        createdAt: order.now,
        updatedAt: order.now,
      })
      return id
    },
    saveLadder: async (row, status) => {
      // Nothing is written down. A ladder that finished stops being worked and
      // the coin is free to arm a fresh one, which is the whole of what
      // "saving" means inside a replay.
      if (status === "done") ladders.delete(row.marketKey)
    },
  }

  // Every bar time any coin has, oldest first. Coins list at different moments
  // and some skip bars they had no trades in, so this is a merge rather than
  // one coin's own list.
  const times = [
    ...new Set(coins.flatMap((coin) => coin.bars.map((bar) => bar.openTime))),
  ].sort((left, right) => left - right)

  const barAt = new Map<string, Map<number, CandleBar>>(
    coins.map((coin) => [
      coin.marketKey,
      new Map(coin.bars.map((bar) => [bar.openTime, bar])),
    ])
  )

  /** The last close each coin has had so far — the price "right now" is not used. */
  const marks = new Map<string, number>()
  const firstPx = new Map<string, number>()
  const fillsByMarket = new Map<string, BacktestEngineFill[]>(
    coins.map((coin) => [coin.marketKey, []])
  )

  const equity: Array<{ t: number; usd: number }> = []
  const inPlay: number[] = []
  let stoppedEarly = false
  let reachedTo = input.from

  for (const [index, time] of times.entries()) {
    if (index % CHUNK_BARS === 0) {
      await hooks.onProgress?.(times.length === 0 ? 1 : index / times.length)
      if (await hooks.shouldStop?.()) {
        stoppedEarly = true
        break
      }
    }

    const closeTime = time + barMs
    reachedTo = closeTime

    // ----- The bars ------------------------------------------------------
    for (const coin of coins) {
      const bar = barAt.get(coin.marketKey)?.get(time)
      if (!bar) continue
      if (!firstPx.has(coin.marketKey)) firstPx.set(coin.marketKey, bar.open)
      marks.set(coin.marketKey, bar.close)

      // No price "right now": a replay only knows what the bar said, and
      // handing it today's price would let a trade see the future.
      settleMarket(book, coin.marketKey, {
        bars: [bar],
        barMs,
        mark: null,
        now: closeTime,
      })
    }

    // ----- What the ladders make of it -----------------------------------
    const ladderBars: LadderBars = new Map(
      [...ladders.keys()].flatMap((marketKey) => {
        const coin = byKey.get(marketKey)
        if (!coin) return []
        return [
          [
            ladderBarsKey("base", marketKey),
            { bars: [...coin.baseBars], barMs: BASE_STOP_BAR_MS },
          ],
          [
            ladderBarsKey("green", marketKey),
            { bars: [...coin.bars], barMs },
          ],
        ] as Array<[string, { bars: CandleBar[]; barMs: number }]>
      })
    )

    for (const marketKey of [...ladders.keys()].sort()) {
      const row = ladders.get(marketKey)
      if (!row) continue
      await advanceOne({ book, marks, ladderBars, now: closeTime }, deps, row)
    }

    // ----- Arming a fresh ladder where there is none ----------------------
    for (const coin of coins) {
      if (ladders.has(coin.marketKey)) continue
      const mark = marks.get(coin.marketKey)
      if (mark === undefined || !(mark > 0)) continue
      // Nothing arms while a position is still open on that coin: the ladder
      // that opened it is the one that has to close it.
      if (book.positions.has(coin.marketKey)) continue

      const outcome = armLadder({
        marketKey: coin.marketKey,
        params: input.params,
        interval: input.interval,
        mark,
        base: baseAt(coin, closeTime, detection),
        rules: coin.rules,
        roundPx: (px) => protocol.markets.roundPx(px, coin.rules.sizeDecimals),
        equity: paperAccountFigures({
          startingBalance: input.startingUsd,
          realized: book.cash - input.startingUsd,
          positions: [...book.positions.values()],
          marks,
        }).equity,
        freeCash: freeCash(book),
        openOrderCount: book.orders.length,
        // This bar, so the ladder never reads candles from before it existed.
        startedAt: closeTime,
        maxOpenOrders: orderCap,
        heldSzi: book.positions.get(coin.marketKey)?.szi ?? null,
        nextOrderId,
      })
      if (!outcome.plan) continue

      // The draft names an order id for every rung that is going to wait, and
      // the real placement writes those orders down straight afterwards. This
      // is that step: without it the rungs would be waiting on orders that do
      // not exist, and the next advance would write every one of them off as
      // never filled.
      const exits = ladderExitLevels(outcome.plan)
      for (const [index, rung] of outcome.plan.rungs.entries()) {
        if (rung.orderId === null) continue
        book.orders.push({
          id: rung.orderId,
          walletId: book.wallet.id,
          marketKey: coin.marketKey,
          side: "buy",
          px: rung.px,
          sz: rung.sz,
          leverage: 1,
          maxLeverage: outcome.plan.maxLeverage,
          reduceOnly: false,
          tpPx: null,
          slPx: null,
          // Where this rung sells, riding along with the buy so it rests the
          // instant the buy fills rather than when the candle finishes.
          exitPx:
            outcome.plan.takeProfit?.mode === "prevRung" ? exits[index] : null,
          createdAt: closeTime,
          updatedAt: closeTime,
        })
      }

      ladders.set(coin.marketKey, {
        id: `backtest-ladder-${coin.marketKey}-${closeTime}`,
        marketKey: coin.marketKey,
        plan: outcome.plan,
      })
    }

    // ----- Take the fills off the book and record the pot -----------------
    for (const one of book.fills) {
      // Which rung this was, read off the ladder working the coin right now.
      //
      // Matched on SIZE, not price. Rungs used to rest as orders and fill at
      // exactly their own price, so the price was the rung's name — but a rung
      // that buys at market fills wherever price was, which is never its own
      // line, and every arrow lost its rung number the day that changed. The
      // size is what survives: the rung records the amount it actually bought,
      // so that is what ties the fill back to it. Price only breaks a tie
      // between two rungs that happened to buy the same amount.
      const plan = ladders.get(one.marketKey)?.plan
      let rung = -1
      if (one.side === "buy" && plan) {
        let best = Infinity
        for (const [index, candidate] of plan.rungs.entries()) {
          if (candidate.status !== "filled" && candidate.status !== "sold") continue
          if (Math.abs(candidate.sz - one.sz) > Math.max(1e-9, one.sz * 1e-9)) continue
          const gap = Math.abs(candidate.px - one.px)
          if (gap < best) {
            best = gap
            rung = index
          }
        }
      }
      fillsByMarket
        .get(one.marketKey)
        ?.push({ ...one, rung: rung >= 0 ? rung : null })
    }
    book.fills = []
    book.touchedMarkets.clear()
    book.goneOrderIds.clear()

    const held = [...book.positions.values()]
    const figures = paperAccountFigures({
      startingBalance: input.startingUsd,
      realized: book.cash - input.startingUsd,
      positions: held,
      marks,
    })
    equity.push({ t: closeTime, usd: figures.equity })
    inPlay.push(
      held.reduce((sum, position) => sum + positionMargin(position), 0)
    )
  }

  await hooks.onProgress?.(1)

  return {
    coins: coins.map((coin) => ({
      marketKey: coin.marketKey,
      fills: fillsByMarket.get(coin.marketKey) ?? [],
      openAtEnd: book.positions.get(coin.marketKey) ?? null,
      lastPx: marks.get(coin.marketKey) ?? null,
      firstPx: firstPx.get(coin.marketKey) ?? null,
    })),
    equity,
    inPlay,
    endingUsd: equity[equity.length - 1]?.usd ?? input.startingUsd,
    stoppedEarly,
    reachedTo,
  }
}

/**
 * The confirmed base as of this moment, read off the 4h bars the coin came
 * with — the same question `marketBaseInForce` asks the exchange, asked of
 * history instead.
 *
 * The bar still being filled in is left out: it cannot have confirmed a level,
 * and counting it would let the run see a moment that had not finished.
 */
function baseAt(
  coin: BacktestCoin,
  now: number,
  detection: { searchBars: number; holdBars: number }
): number | null {
  const closed = coin.baseBars.filter(
    (bar) => bar.openTime + BASE_STOP_BAR_MS <= now
  )
  if (closed.length === 0) return null
  return baseInForce(closed, detection)
}
