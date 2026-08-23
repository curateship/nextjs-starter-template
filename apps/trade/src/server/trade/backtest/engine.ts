import type {
  CandleBar,
  CandleInterval,
  FundingRate,
  NetworkId,
  ProtocolId,
} from "@/lib/protocols/contracts"
import type { DcaBaseDetection } from "@/lib/trade/dca"
import {
  BASE_STOP_BAR_MS,
  MIN_ORDER_USD,
  baseStopDetection,
  floorSize,
  ladderExitLevels,
  type DcaParams,
  type LadderPlan,
} from "@/lib/trade/dca"
import { marketIsCascading } from "@/lib/trade/cascade"
import { baseLevelsInForce } from "@/lib/trade/indicators/base"
import type { IndicatorSignal } from "@/lib/trade/indicators/contract"
import {
  indicatorSignals,
  type IndicatorSettings,
} from "@/lib/trade/indicators/registry"
import { ascending, lastClosedIndex } from "@/lib/trade/candle-window"
import {
  liquidationPx,
  paperAccountFigures,
  positionMargin,
  type PaperCosts,
  type PaperJournalEntry,
  type TradePosition,
} from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import { getProtocol } from "@/server/protocols/registry"
import type { MarketRules } from "@/server/trade/market-rules"
import { armLadder } from "@/server/trade/backtest/arm"
import {
  bumpOrders,
  fill,
  freeCash,
  MAX_OPEN_ORDERS,
  closeBar,
  openBar,
  settleMarket,
  type WalletBook,
} from "@/server/trade/paper"
import {
  advanceOne,
  ladderBarsKey,
  type LadderBars,
  type LadderFeed,
  type LadderEngineDeps,
  type LadderRow,
} from "@/server/trade/smart-ladders"
import { advanceSignal, type SignalRow } from "@/server/trade/smart-signals"

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

/**
 * Could anything at all happen to this coin inside this bar?
 *
 * The answer is what makes zooming affordable. A ladder rests for days with
 * price nowhere near a rung, and fetching minutes for every one of those days
 * was most of the cost and changed nothing: with no level inside the bar's
 * range, the minute-by-minute walk and the whole-bar walk fill exactly the same
 * nothing.
 *
 * **It cannot miss anything.** Every price the real minutes visit is inside the
 * bar's own high and low, so a level the minutes reach is a level this test has
 * already said yes to. It is a superset, not a sample.
 */
function couldActInBar(
  book: WalletBook,
  marketKey: string,
  bar: CandleBar
): boolean {
  const inRange = (level: number | null | undefined) =>
    level != null && level >= bar.low && level <= bar.high

  // The order's own price only. A resting buy carries the sell it will hand to
  // the position (`exitPx`), and that price sits above the market for days on
  // end — but it cannot fire until the buy has filled, and a bar the buy fills
  // in has the buy's own price inside it anyway.
  for (const order of book.orders) {
    if (order.marketKey !== marketKey) continue
    if (inRange(order.px)) return true
  }

  const held = book.positions.get(marketKey)
  if (!held) return false
  return (
    inRange(held.tpPx) || inRange(held.slPx) || inRange(liquidationPx(held))
  )
}

/** One minute of price. Binance's smallest candle, and the smallest we zoom to. */
const MINUTE_MS = 60_000

type WalkCoin = { marketKey: string }

/**
 * The old walk: one candle per coin, coins taken in turn.
 *
 * Every coin is first held at the worst price its own candle reached, because
 * the coins are walked one after another and without it the ones further down
 * the list are still valued where they closed LAST time while the market is
 * falling through all of them at once. That is a guess, and a harsh one — see
 * `walkByMinute` for the version that does not guess.
 */
function walkWholeBar(input: {
  book: WalletBook
  coins: readonly WalkCoin[]
  barAt: Map<string, Map<number, CandleBar>>
  time: number
  barMs: number
  closeTime: number
}): void {
  const { book, coins, barAt, time, barMs, closeTime } = input

  const lows = new Map<string, number>()
  for (const coin of coins) {
    const bar = barAt.get(coin.marketKey)?.get(time)
    if (bar && bar.low > 0) lows.set(coin.marketKey, bar.low)
  }
  openBar(book, lows)

  for (const coin of coins) {
    const bar = barAt.get(coin.marketKey)?.get(time)
    if (!bar) continue
    // No price "right now": a replay only knows what the bar said, and handing
    // it today's price would let a trade see the future.
    settleMarket(book, coin.marketKey, {
      bars: [bar],
      barMs,
      mark: null,
      now: closeTime,
    })
  }
}

/**
 * The same bar walked on real minute prices, every coin advancing together.
 *
 * What it removes is the invented order of events. A four-hour candle that
 * closed down is walked as open → high → low → close, because that is the
 * conservative reading, but on 10 October 2025 the coins fell for eleven
 * minutes and bottomed within five minutes of each other — and which of a rung
 * and a stop came first decided whether the ladder bought the crash or was
 * closed by it. Minute by minute there is nothing left to decide.
 *
 * It removes the money guess with it. Each minute every coin is marked where it
 * really was at the end of that minute, so a coin that recovered early really
 * does free up its money for the next coin's rung, and one still falling really
 * does hold that money down.
 *
 * A minute is still a candle, so the same reading applies inside it — sixty
 * seconds of it instead of four hours.
 *
 * Coins without minutes for this bar are walked whole afterwards. They are the
 * ones holding nothing and resting nothing, so the bar cannot do anything to
 * them; they are walked at all only so a coin picked up later starts from the
 * right price.
 */
async function walkByMinute(input: {
  book: WalletBook
  coins: readonly WalkCoin[]
  barAt: Map<string, Map<number, CandleBar>>
  time: number
  barMs: number
  zoomed: Map<string, readonly CandleBar[]>
  marks: Map<string, number>
  /** Work one coin's ladder, as of a moment part-way through the bar. */
  advanceCoin: (
    marketKey: string,
    at: number,
    midCandle?: boolean
  ) => Promise<void>
  /** Move this minute's fills off the book and into the run's record. */
  takeFills: () => void
  /**
   * The pot as it stands right now, asked once a minute.
   *
   * **Why the walk has to report this.** The pot is written down once per
   * candle, at its close, so a fall and a recovery inside one candle leave no
   * trace at all — 10 October 2025 fell 70% and bounced back inside a single
   * four-hour bar, and "worst dip" read 33% for a day that took far more than
   * that away and gave it back. Walking the minutes is the only way to see it,
   * so the minutes are where it gets recorded.
   */
  notePot: (at: number) => void
}): Promise<void> {
  const {
    book,
    coins,
    barAt,
    time,
    barMs,
    zoomed,
    marks,
    advanceCoin,
    takeFills,
    notePot,
  } = input

  // Every minute any zoomed coin has, oldest first. A merge rather than a count
  // from the bar's open: a coin can be missing minutes the exchange never
  // published, and a fixed grid would walk it on a candle it does not have.
  const minutes = [
    ...new Set(
      [...zoomed.values()].flatMap((bars) => bars.map((bar) => bar.openTime))
    ),
  ].sort((left, right) => left - right)

  const minuteAt = new Map(
    [...zoomed].map(([marketKey, bars]) => [
      marketKey,
      new Map(bars.map((bar) => [bar.openTime, bar])),
    ])
  )

  for (const minute of minutes) {
    // The same discipline as the whole-bar walk, at a sixtieth of the size: no
    // coin is valued at a price this minute only reached later while another
    // coin is being walked through it.
    const lows = new Map<string, number>()
    const closes = new Map<string, number>()
    for (const [marketKey, bars] of minuteAt) {
      const bar = bars.get(minute)
      if (!bar) continue
      if (bar.low > 0) lows.set(marketKey, bar.low)
      if (bar.close > 0) closes.set(marketKey, bar.close)
    }
    openBar(book, lows)

    const filled = new Set<string>()
    for (const coin of coins) {
      const bar = minuteAt.get(coin.marketKey)?.get(minute)
      if (!bar) continue
      const before = book.fills.length
      settleMarket(book, coin.marketKey, {
        bars: [bar],
        barMs: MINUTE_MS,
        mark: null,
        now: minute + MINUTE_MS,
      })
      if (book.fills.length !== before) filled.add(coin.marketKey)
    }

    closeBar(book, closes)

    // A ladder is worked the moment one of its rungs fills, not at the end of
    // the bar.
    //
    // Without this the zoom is worth much less than it looks. A rung that
    // bought at minute 12 has no target on it until the ladder is next worked,
    // so a bounce at minute 30 that cleared that target sells nothing — which
    // is the very trade the minutes exist to find. Asked only for the coins
    // that actually filled, and only in the minute they filled, because a
    // ladder whose position did not change has nothing new to say.
    for (const marketKey of [...filled].sort()) {
      await advanceCoin(marketKey, minute + MINUTE_MS, true)
    }

    notePot(minute + MINUTE_MS)

    // This minute's fills come off the book before the next minute starts.
    //
    // Not tidying: the ladder claims a fill to work out which rung bought, and
    // it builds a fresh claim list every pass. Leaving a whole candle's fills
    // on the book meant the same buy could be claimed again by a later minute
    // and mark a second rung as bought.
    takeFills()
  }

  // The same worst-price guard the whole-bar walk uses, for the few coins left
  // on it: a coin the exchange had no minutes for still must not be valued at a
  // price this bar only reached later.
  const restLows = new Map<string, number>()
  for (const coin of coins) {
    if (zoomed.has(coin.marketKey)) continue
    const bar = barAt.get(coin.marketKey)?.get(time)
    if (bar && bar.low > 0) restLows.set(coin.marketKey, bar.low)
  }
  openBar(book, restLows)

  for (const coin of coins) {
    if (zoomed.has(coin.marketKey)) continue
    const bar = barAt.get(coin.marketKey)?.get(time)
    if (!bar) continue
    marks.set(coin.marketKey, bar.close)
    settleMarket(book, coin.marketKey, {
      bars: [bar],
      barMs,
      mark: null,
      now: time + barMs,
    })
  }
}


export type BacktestCoin = {
  marketKey: string
  symbol: string
  rules: MarketRules
  /** The bars the strategy is walked over — the window only, warm-up excluded. */
  bars: readonly CandleBar[]
  /** 4h bars from before the window as well, for the base rule. */
  baseBars: readonly CandleBar[]
  /**
   * Candles from BEFORE the window, at the run's own interval, for a signals
   * run — so its indicators can see far enough back to speak about the window's
   * first bars. Empty on a ladder run, which reads its history off `baseBars`.
   *
   * **What it prevents is a run that reports a flat line.** An indicator handed
   * only the stretch being tested cannot say anything about its first candles,
   * so the run silently tested less than it claimed — and with a long search
   * over a short window, nothing at all, while still printing a result.
   */
  warmupBars?: readonly CandleBar[]
  /** Historical settlements inside the run window, oldest first. */
  funding: readonly FundingRate[]
}

/**
 * What the run is testing.
 *
 * A union rather than two fields, so a walk that reads a ladder's rungs out of
 * a signals run cannot compile. The candle size stays outside it: both need
 * one, and the merge of every coin's bar times is built from it before either
 * strategy is asked anything.
 */
export type BacktestStrategy =
  | { kind: "dca"; params: DcaParams }
  | {
      kind: "signals"
      indicators: IndicatorSettings
      /** What one buy signal spends, as a share of the pot. */
      stakePct: number
      /** How far a buy follows a price that runs, as a share of it. */
      chaseGiveUp: number
    }

export type BacktestRunInput = {
  protocol: ProtocolId
  network: NetworkId
  startingUsd: number
  costs: PaperCosts
  strategy: BacktestStrategy
  interval: CandleInterval
  coins: readonly BacktestCoin[]
  from: number
  to: number
  /**
   * Real minute prices for one coin's bar — how the walk stops guessing.
   *
   * A candle says where price opened, closed and how far it got each way, never
   * the order it did them in, so `candleLegs` invents an order. That invention
   * decides which of two levels inside the same candle fired first: a rung or
   * the stop, a target or a liquidation. It also decides what every OTHER coin
   * was worth while this one was being walked, which is what buying power is
   * read off.
   *
   * When this is supplied and answers, the bar is walked minute by minute
   * across every coin at once instead, and nothing is invented. Left out — as
   * every test and the practice engine leave it out — the walk is exactly what
   * it was.
   *
   * Only ever asked for a coin holding a position or resting an order: a coin
   * with neither cannot do anything inside the bar, so its minutes would change
   * nothing and cost a fetch.
   */
  zoomIn?: (
    marketKey: string,
    barOpen: number,
    barMs: number
  ) => Promise<readonly CandleBar[] | null>
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
  openAtEnd: TradePosition | null
  /** The last price this coin had inside the window. */
  lastPx: number | null
  /** The first price this coin had inside the window. */
  firstPx: number | null
  /** When that first bar was — null when the coin had none. */
  firstAt: number | null
  /** Positive when this coin paid funding, negative when it received it. */
  fundingPaid: number
  /**
   * Every reason a ladder was turned down on this coin, and how many bars each
   * one held it back. Empty when one armed on the first chance it got.
   */
  armRefusals: ArmRefusal[]
  /** Every change to every rung, oldest first — what was actually on the book. */
  rungEvents: RungEvent[]
}

/** One reason a ladder could not be armed, tallied over the whole walk. */
export type ArmRefusal = { reason: string; bars: number; lastAt: number }

/**
 * One change to one rung, the moment it happened.
 *
 * **The replay's only record of what a ladder actually had on the book.** A
 * fill says a rung bought; nothing said whether the other six were waiting with
 * an order, had been skipped for being passed, or had been killed under the
 * stop. So "price fell through rung 5 and nothing happened" had no answer
 * except reading the strategy by hand and guessing.
 *
 * Changes only, not a snapshot per bar: a run is twelve thousand bars across a
 * hundred and fifty coins, and all but a handful of those bars change nothing.
 */
export type RungEvent = {
  /** Counted from 0, matching the fills. */
  rung: number
  /** The bar it changed on. */
  at: number
  /** Its price, so the event reads without cross-referencing the plan. */
  px: number
  /**
   * What it became: `armed` has an order on the book, `waiting` has none,
   * `skipped` had its moment pass, `dead` is under the stop, and `filled` or
   * `sold` are the ordinary endings.
   */
  state: string
}

export type BacktestRunOutcome = {
  coins: BacktestCoinTrades[]
  /** The combined pot at every bar time, in order. */
  equity: Array<{ t: number; usd: number }>
  /** How much was in trades at each bar time, for the money-in-play figures. */
  inPlay: number[]
  endingUsd: number
  /** Positive when the combined wallet paid funding, negative when it received it. */
  fundingPaid: number
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
  const ladder = input.strategy.kind === "dca" ? input.strategy : null
  const signals = input.strategy.kind === "signals" ? input.strategy : null
  // The flow's own two numbers, not the indicator's factory pair. A signals run
  // has no base stop to ride, so it needs none.
  const detection = ladder?.params.baseDetection ?? baseStopDetection()

  const book: WalletBook = {
    wallet: backtestWallet(input),
    costs: input.costs,
    cash: input.startingUsd,
    positions: new Map(),
    orders: [],
    fills: [],
    touchedMarkets: new Set(),
    goneOrderIds: new Set(),
    // The run's own rule, read off the ladder it is testing.
    entryLimit: ladder?.params.entryLimit ?? null,
    openedAt: [],
    liquidatedThisPass: new Set(),
    // Set once a bar, below, from the crash rule the run is testing.
    crashEntry: { cascading: false, leastLeverage: null },
    ordersVersion: 0,
    // Filled in as each bar is walked, so buying power falls with the wallet.
    marks: new Map(),
    addedOrders: [],
  }

  // Alphabetical, once, and everything downstream walks this list. Two runs
  // fed the same coins in different orders take the same path through the
  // same pot, which is the only reason their answers can be compared.
  // Room for every coin in the run to hold a full ladder, plus its exits.
  // The practice wallet's fifty is a guard against a person forgetting orders
  // on a chart; applied to a replay it silently capped the run at the first
  // fourteen coins in the alphabet and left the rest untested.
  // A signals run holds at most one order per coin, so one apiece is already
  // generous; a ladder holds a rung and its exit for every rung it drew.
  const orderCap =
    input.coins.length * ((ladder?.params.rungs.length ?? 0) + 2) +
    MAX_OPEN_ORDERS

  const coins = [...input.coins].sort((left, right) =>
    left.marketKey.localeCompare(right.marketKey)
  )

  // Order ids are counted rather than rolled: nothing inside a run may read a
  // random number, or two identical runs stop being identical.
  let nextId = 0
  const nextOrderId = () => `backtest-order-${(nextId += 1)}`

  /** Every ladder still working, one per coin at most. */
  const ladders = new Map<string, LadderRow>()
  /** Every signal trade still working, on a signals run. Also one per coin. */
  const trades = new Map<string, SignalRow>()
  /**
   * How far through each coin's arrows the walk has read.
   *
   * A forward-only cursor, and not an optimisation — the difference between
   * finishing and not. The signals are worked out ONCE per coin, up front,
   * because the rule only ever looks backwards: the arrow at candle 40 is
   * decided by candles 0 to 40 and candle 41 cannot change it. Asking again per
   * bar is what took the server down when the base did it.
   */
  const signalsPerCoin = new Map<string, readonly IndicatorSignal[]>()
  const signalCursor = new Map<string, number>()

  const deps: LadderEngineDeps = {
    fill,
    dropOrder: (heldBook, orderId) => {
      // Taken out where it sits, rather than by rebuilding the list around it.
      // A big run keeps a thousand orders on the book and drops them by the
      // hundred every bar, so the rebuilt copy was a thousand-entry array
      // thrown away thousands of times a second — a tenth of the whole run.
      const at = heldBook.orders.findIndex((order) => order.id === orderId)
      if (at >= 0) heldBook.orders.splice(at, 1)
      bumpOrders(heldBook)
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
      bumpOrders(book)
      return id
    },
    saveLadder: async (row, status) => {
      // Nothing is written down. A smart order that finished stops being worked
      // and the coin is free to start a fresh one, which is the whole of what
      // "saving" means inside a replay.
      if (status === "done") {
        ladders.delete(row.marketKey)
        trades.delete(row.marketKey)
      }
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
  // When each coin's history actually starts. A coin listed part way through
  // the window is tested from the day it existed, and the report says so.
  const firstAt = new Map<string, number>()
  /**
   * Why each coin went without a ladder, counted as the walk goes.
   *
   * Kept here rather than worked out afterwards because the answer only exists
   * at the moment it is decided: it depends on where the base was on that bar
   * and what cash was free, neither of which survives to the end of the run.
   */
  const refusalsByMarket = new Map<string, Map<string, ArmRefusal>>()
  const noteRefusal = (marketKey: string, reason: string, at: number) => {
    // The rung number on `SMART_RUNG_TOO_SMALL:3` would make one reason look
    // like twenty. The code alone is the reason; which rung it was is not.
    const code = reason.split(":")[0]
    const forCoin =
      refusalsByMarket.get(marketKey) ?? new Map<string, ArmRefusal>()
    const seen = forCoin.get(code)
    if (seen) {
      seen.bars += 1
      seen.lastAt = at
    } else {
      forCoin.set(code, { reason: code, bars: 1, lastAt: at })
    }
    refusalsByMarket.set(marketKey, forCoin)
  }

  /**
   * Which rung placed which order — remembered while the rung still knows.
   *
   * A rung drops its order id the moment it fills, and the fills are only
   * written down at the end of the bar, so by then the link is gone. Kept here
   * as the ladders are walked, which is the last point both halves exist.
   *
   * Order ids are counted, never reused, so this only ever grows by one entry
   * per rung placed.
   */
  const rungByOrderId = new Map<string, number>()
  const rememberRungOrders = (plan: LadderPlan) => {
    for (const [index, rung] of plan.rungs.entries()) {
      if (rung.orderId) rungByOrderId.set(rung.orderId, index)
    }
  }

  /**
   * What each rung looked like last time we looked, and every change since.
   *
   * Diffed after each bar rather than written from inside the engine: the
   * engine is the live one, shared with real money, and threading a recorder
   * through every place a rung changes would be a second thing to keep in step
   * with the first. A diff cannot fall out of step — it reads the same plan the
   * engine just finished writing.
   */
  const rungWas = new Map<string, string[]>()
  const rungEventsByMarket = new Map<string, RungEvent[]>()
  const noteRungs = (marketKey: string, plan: LadderPlan, at: number) => {
    const now = plan.rungs.map((rung) =>
      rung.status === "waiting"
        ? rung.dead
          ? "dead"
          : rung.orderId
            ? "armed"
            : "waiting"
        : rung.status
    )
    const before = rungWas.get(marketKey)
    const events = rungEventsByMarket.get(marketKey) ?? []
    for (const [index, state] of now.entries()) {
      // A ladder that has just replaced another has a different rung count;
      // treat anything without a previous state as new rather than unchanged.
      if (before && before[index] === state) continue
      events.push({ rung: index, at, px: plan.rungs[index].px, state })
    }
    rungWas.set(marketKey, now)
    rungEventsByMarket.set(marketKey, events)
  }

  const fillsByMarket = new Map<string, BacktestEngineFill[]>(
    coins.map((coin) => [coin.marketKey, []])
  )
  const fundingPaidByMarket = new Map<string, number>(
    coins.map((coin) => [coin.marketKey, 0])
  )
  const fundingIndex = new Map<string, number>(
    coins.map((coin) => [coin.marketKey, 0])
  )

  /**
   * Settle funding up to one moment against the position and last known price.
   * The exchange uses its oracle price; the replay's stored historical price
   * is the closest fact available at that same hour.
   */
  const applyFundingThrough = (time: number, includeTime: boolean) => {
    for (const coin of coins) {
      let index = fundingIndex.get(coin.marketKey) ?? 0
      while (index < coin.funding.length) {
        const funding = coin.funding[index]
        if (funding.time > time || (!includeTime && funding.time === time)) break

        const position = book.positions.get(coin.marketKey)
        const mark = marks.get(coin.marketKey)
        if (position && mark !== undefined) {
          // Signed size carries both directions: a positive rate costs a long
          // and pays a short; a negative rate does the reverse.
          const paid = position.szi * mark * funding.rate
          book.cash -= paid
          fundingPaidByMarket.set(
            coin.marketKey,
            (fundingPaidByMarket.get(coin.marketKey) ?? 0) + paid
          )
        }
        index += 1
      }
      fundingIndex.set(coin.marketKey, index)
    }
  }

  // What each coin's ladder reads, built once. Nothing in here changes as the
  // walk goes on — the bars are the whole history from the first bar to the
  // last, and every reader picks its own place in them by the time it is asked
  // about. Sorted once here rather than on every look, for the same reason.
  const feeds = new Map<string, Array<[string, LadderFeed]>>(
    coins.map((coin) => [
      coin.marketKey,
      [
        [
          ladderBarsKey("base", coin.marketKey),
          { bars: ascending(coin.baseBars), barMs: BASE_STOP_BAR_MS },
        ],
        [ladderBarsKey("green", coin.marketKey), { bars: ascending(coin.bars), barMs }],
      ],
    ])
  )

  // Every arrow every coin will ever print, worked out once before the walk
  // starts.
  //
  // **Not an optimisation — the difference between finishing and not.** The
  // rule only ever looks backwards, so the arrow at candle 40 is decided by
  // candles 0 to 40 and candle 41 cannot change it; asking again at every bar
  // is the same answer computed thousands of times. The base rule did exactly
  // that once, and a run of 250 coins over ten years never finished and took
  // the server's memory with it.
  if (signals) {
    for (const coin of coins) {
      // Computed over the warm-up AND the window, then cut back to the window.
      // The warm-up is there so the indicator can SEE, never so the run can
      // trade on it: an arrow that printed before the run started is not this
      // run's to act on, and acting on it would buy at the window's first bar
      // on the strength of something that happened before it.
      const walked = ascending(coin.bars)
      const first = walked[0]?.openTime ?? input.from
      const called = indicatorSignals(signals.indicators, [
        ...ascending(coin.warmupBars ?? []),
        ...walked,
      ])
      signalsPerCoin.set(
        coin.marketKey,
        called.filter((one) => one.time >= first)
      )
    }
  }

  const equity: Array<{ t: number; usd: number }> = []
  const inPlay: number[] = []
  let stoppedEarly = false
  let reachedTo = input.from

  // The crash rule, and the candles it reads. Null when the flow did not ask
  // for it, which skips the whole check rather than running it and ignoring
  // the answer.
  // A signals run has no crash rule at all: it exits on an arrow, and holding
  // out through a collapse is a ladder's idea about its own rungs.
  const cascadeRule = ladder?.params.cascade ?? null
  // Oldest-first, like every other reader of these bars: the crash check finds
  // its window by binary search and quietly reads the wrong stretch of history
  // if the bars are not in order.
  const cascadeBars: ReadonlyMap<string, readonly CandleBar[]> = new Map(
    coins.map((coin) => [coin.marketKey, ascending(coin.bars)])
  )

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

    // A liquidation is "just now" for the length of its own candle: the
    // ladder must still see it at the candle's end, however many minute
    // drains happened in between, and must not still see it a day later.
    book.liquidatedThisPass.clear()

    // Funding between candles belongs to the position carried from the last
    // close. The settlement exactly on this close waits until this candle's
    // resting orders have been filled below.
    applyFundingThrough(closeTime, false)

    // ----- Is the whole market falling off a cliff on this bar? ------------
    //
    // Once per bar for every coin at once, not once per coin: the question is
    // about the market, and a run watching 400 coins would otherwise ask it
    // 400 times a bar. Judged as of the bar's CLOSE, matching everything else
    // the engine does — a bar that has not finished cannot have confirmed
    // anything.
    const cascading =
      cascadeRule !== null &&
      marketIsCascading({
        settings: cascadeRule,
        coins: cascadeBars,
        now: closeTime,
      })

    // Rungs that were already resting when the crash arrived are the normal
    // case, not the exception: the ladder placed them days ago, each with its
    // exit riding along. Withholding the exit only on orders placed DURING the
    // crash would leave every one of those to sell itself at the floor, which
    // is the whole thing being prevented. The exit is dropped rather than
    // moved — once the hold ends, `advanceOne` places it again as it always
    // does, from the rung's own status.
    // The fills need to know too: a rung is an order the wick fills, and it
    // never goes near a ladder, so the rule has to sit on the book.
    book.crashEntry = {
      cascading,
      leastLeverage: cascadeRule?.leastLeverage ?? null,
    }

    if (cascading) {
      for (const order of book.orders) {
        if (order.side === "buy" && order.exitPx != null) order.exitPx = null
      }
    }

    // ----- The bars ------------------------------------------------------
    //
    // The first price of the window per coin, for buy-and-hold, and the close
    // every coin is worth once the whole bar has finished for all of them.
    for (const coin of coins) {
      const bar = barAt.get(coin.marketKey)?.get(time)
      if (!bar) continue
      if (!firstPx.has(coin.marketKey)) {
        firstPx.set(coin.marketKey, bar.open)
        firstAt.set(coin.marketKey, bar.openTime)
      }
      marks.set(coin.marketKey, bar.close)
    }

    // The feeds themselves are made ONCE, up at `feeds`, and handed over as
    // they are. They used to be copied here — every coin's whole history, twice
    // over, on every bar. A run of 250 coins over ten years copied about ninety
    // megabytes of pointers per bar and did it twenty-two thousand times, which
    // is most of why the server fell over rather than finishing.
    //
    // Built before the walk rather than after it, because a bar walked minute
    // by minute works its ladders inside the walk.
    const ladderBars: LadderBars = new Map(
      [...ladders.keys()].flatMap((marketKey) => {
        const feed = feeds.get(marketKey)
        return feed ? feed : []
      })
    )

    /** Work one coin's ladder, as of a moment part-way through the bar. */
    const advanceCoin = async (
      marketKey: string,
      at: number,
      midCandle = false
    ) => {
      const row = ladders.get(marketKey)
      if (!row) return
      rememberRungOrders(row.plan)
      await advanceOne(
        { book, marks, ladderBars, now: at, cascading, midCandle },
        deps,
        row
      )
      noteRungs(marketKey, row.plan, at)
    }

    /**
     * Move whatever has filled off the book and into this run's record.
     *
     * Called once per candle normally, and once per MINUTE on a candle walked
     * minute by minute — because the ladder claims fills to work out which
     * rung bought, and a fill left on the book can be claimed twice.
     */
    const takeFills = () => {
      for (const one of book.fills) {
        // Which rung this was — **asked of the order, not guessed from the
        // fill.** The rung placed that order and remembers its id, so this is
        // the rung saying so rather than an afterwards match on size and price.
        //
        // It used to hunt the ladder for a rung of the same size. That works
        // only while the ladder is still there, and a ladder can buy, sell out
        // and be replaced inside one crashing candle — after which the old
        // fills matched nothing. Eighteen buys of 763 lost their rung that way,
        // every one of them on a crash bar, which are the ones worth reading.
        const rung =
          one.side === "buy" && one.orderId
            ? (rungByOrderId.get(one.orderId) ?? -1)
            : -1
        // Stamped with the bar's OPEN time, not the close time the engine runs
        // on. A candle is named by the moment it opened everywhere else in the
        // app, so a fill stamped with the close lands on the NEXT candle — a 4h
        // run puts every trade four hours after it happened. The chart used to
        // hide this by taking a bar back off again in two separate places; the
        // trades table did not, and printed the wrong time.
        //
        // The engine still WORKS on the close time and must keep doing so: a bar
        // is only settled once it has finished, and reading it earlier would let
        // a trade see inside a candle that had not happened yet.
        //
        // **Including a bar walked minute by minute.** The minutes are how the
        // walk works out what happened; they are not where a mark belongs. The
        // chart draws on the run's own candles, so a fill carrying 21:19 sits
        // between two four-hour candles — its arrow floats off the candle it
        // bought on and its line stretches away to the wrong one.
        fillsByMarket
          .get(one.marketKey)
          ?.push({ ...one, fillTime: time, rung: rung >= 0 ? rung : null })
      }
      book.fills = []
    }


    /**
     * The worst the pot got part-way through this candle, and when.
     *
     * Kept as one extra point rather than a point a minute: the drawdown has to
     * see the bottom, and 240 points per crashing candle would bury the curve
     * the rest of the run is drawn on.
     */
    let worstInBar: { t: number; usd: number; margin: number } | null = null
    const notePot = (at: number) => {
      const positions = [...book.positions.values()]
      const usd = paperAccountFigures({
        startingBalance: input.startingUsd,
        realized: book.cash - input.startingUsd,
        positions,
        marks: book.marks,
      }).equity
      if (worstInBar !== null && usd >= worstInBar.usd) return
      worstInBar = {
        t: at,
        usd,
        margin: positions.reduce((sum, one) => sum + positionMargin(one), 0),
      }
    }

    // Minute prices for the coins that could actually do something in this bar.
    // A coin holding nothing and resting nothing cannot, so it is never asked
    // for — that is what keeps the fetching to the handful of days a ladder was
    // actually live rather than every day of the window.
    const zoomed = new Map<string, readonly CandleBar[]>()
    if (input.zoomIn) {
      for (const coin of coins) {
        const bar = barAt.get(coin.marketKey)?.get(time)
        if (!bar) continue
        if (!couldActInBar(book, coin.marketKey, bar)) continue
        const minutes = await input.zoomIn?.(coin.marketKey, time, barMs)
        if (minutes && minutes.length > 0) zoomed.set(coin.marketKey, minutes)
      }
    }

    if (zoomed.size > 0) {
      await walkByMinute({
        book,
        coins,
        barAt,
        time,
        barMs,
        zoomed,
        marks,
        advanceCoin,
        takeFills,
        notePot,
      })
    } else {
      walkWholeBar({ book, coins, barAt, time, barMs, closeTime })
    }

    // Every coin has been walked, so the bar has finished for all of them.
    // Only now is the book worth what the bar closed at — until this line,
    // buying power saw the fall rather than the recovery.
    closeBar(book, marks)

    applyFundingThrough(closeTime, true)

    // ----- What the ladders make of it -----------------------------------
    for (const marketKey of [...ladders.keys()].sort()) {
      // `advanceCoin` remembers the rung's order id before working it, because
      // a rung that fills inside this pass throws its order id away and the
      // fills are not written down until later.
      await advanceCoin(marketKey, closeTime)
    }

    // ----- What the signal trades make of it ------------------------------
    if (signals) {
      for (const marketKey of [...trades.keys()].sort()) {
        const row = trades.get(marketKey)
        if (!row) continue
        await advanceSignal(
          { book, marks, ladderBars, now: closeTime, cascading },
          deps,
          row
        )
      }

      // ----- Reading this bar's arrows ------------------------------------
      for (const coin of coins) {
        const cursor = signalCursor.get(coin.marketKey) ?? 0
        const called = signalsPerCoin.get(coin.marketKey) ?? []
        // **Compared against the bar's OPEN time, not its close.**
        //
        // An arrow is named by the candle it printed on, and that candle has
        // only finished once the walk reaches it. Comparing against `closeTime`
        // reads one bar into the future: the arrow belonging to bar 5 has a
        // time equal to bar 4's close, so a run acted on it a whole bar before
        // it could possibly have known — and then measured a price it could
        // never have had. This is the only lookahead this walk can commit and
        // it is the one that would make every result too good.
        //
        // More than one arrow can land in a bar on a coin that skipped bars,
        // and the last of them is the one in force.
        let index = cursor
        let newest: IndicatorSignal | null = null
        while (index < called.length && called[index].time <= time) {
          newest = called[index]
          index += 1
        }
        if (index !== cursor) signalCursor.set(coin.marketKey, index)
        if (!newest) continue

        const held = trades.get(coin.marketKey)
        if (held) {
          // Only a coin being held has anything to do with a sell arrow. One
          // mid-buy or mid-sell is already asking for a price and another arrow
          // cannot change that.
          if (newest.side === "sell" && held.plan.phase === "holding") {
            held.plan.phase = "selling"
          }
          continue
        }
        if (newest.side !== "buy") continue
        const mark = marks.get(coin.marketKey)
        if (mark === undefined || !(mark > 0)) continue
        // Nothing starts while a position is still open on that coin — the
        // trade that opened it is the one that has to close it.
        if (book.positions.has(coin.marketKey)) continue

        const stakeUsd = (input.startingUsd * signals.stakePct) / 100
        const sz = floorSize(stakeUsd / mark, coin.rules.sizeDecimals)
        if (sz <= 0 || mark * sz < MIN_ORDER_USD) continue
        if (mark * sz > freeCash(book) + 1e-9) continue

        trades.set(coin.marketKey, {
          id: `backtest-signal-${coin.marketKey}-${closeTime}`,
          marketKey: coin.marketKey,
          plan: {
            signalPx: mark,
            signalAt: newest.time,
            chaseGiveUp: signals.chaseGiveUp,
            stakeUsd,
            sizeDecimals: coin.rules.sizeDecimals,
            priceTick: coin.rules.priceTick,
            maxLeverage: coin.rules.maxLeverage ?? 1,
            phase: "buying",
            orderId: null,
            orderPx: null,
            // Both zero, the same start the live engine gives them. A backtest
            // has no book for an order to go missing from and no wallet to
            // read a holding off, so neither ever moves from here.
            missingSince: 0,
            heldWhenPlaced: 0,
            chasedAt: 0,
            chases: 0,
            startedAt: closeTime,
          },
        })
      }
    }

    // ----- Arming a fresh ladder where there is none ----------------------
    for (const coin of ladder ? coins : []) {
      if (!ladder) break
      if (ladders.has(coin.marketKey)) continue
      const mark = marks.get(coin.marketKey)
      if (mark === undefined || !(mark > 0)) continue
      // Nothing arms while a position is still open on that coin: the ladder
      // that opened it is the one that has to close it.
      if (book.positions.has(coin.marketKey)) continue

      const outcome = armLadder({
        marketKey: coin.marketKey,
        params: ladder.params,
        interval: input.interval,
        mark,
        base: baseAt(coin, closeTime, detection),
        rules: coin.rules,
        roundPx: (px) => protocol.markets.roundPx(px, coin.rules.sizeDecimals, coin.rules.priceTick),
        // Compound sizes a fresh ladder from the shared pot as it stands now.
        // Fixed keeps every new ladder on the run's opening dollars. The plan
        // then freezes those rung sizes, so an active ladder never shifts.
        equity: ladder.params.compound
          ? paperAccountFigures({
              startingBalance: input.startingUsd,
              realized: book.cash - input.startingUsd,
              positions: [...book.positions.values()],
              marks,
            }).equity
          : input.startingUsd,
        freeCash: freeCash(book),
        openOrderCount: book.orders.length,
        // This bar, so the ladder never reads candles from before it existed.
        startedAt: closeTime,
        maxOpenOrders: orderCap,
        heldSzi: book.positions.get(coin.marketKey)?.szi ?? null,
        nextOrderId,
      })
      if (!outcome.plan) {
        noteRefusal(coin.marketKey, outcome.refusal, closeTime)
        continue
      }

      // The arm named an order id for every rung that is going to wait, and
      // this writes those orders onto the replay's book. They model the live
      // trigger: a bar's wick trading through a rung is the replay's only way
      // of seeing "price crossed it", and the order's exit riding along is
      // what lets the same bar's bounce sell it — the crash-day behaviour
      // every measured run was measured on.
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
          leverage: outcome.plan.leverage,
          maxLeverage: outcome.plan.maxLeverage,
          reduceOnly: false,
          tpPx: null,
          slPx: null,
          // Withheld while the market is falling off a cliff — see the same
          // decision in `reviveRungs`. A ladder armed INSIDE the crash bar is
          // the common case on a day like this, so the test has to be here as
          // well as there.
          exitPx:
            outcome.plan.takeProfit?.mode === "prevRung" && !cascading
              ? exits[index]
              : null,
          createdAt: closeTime,
          updatedAt: closeTime,
        })
        bumpOrders(book)
      }

      ladders.set(coin.marketKey, {
        id: `backtest-ladder-${coin.marketKey}-${closeTime}`,
        marketKey: coin.marketKey,
        plan: outcome.plan,
      })
    }

    // ----- Take the fills off the book and record the pot -----------------
    takeFills()
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
    // The bar's own name again, for the reason on the fills above. This is the
    // pot once this bar has finished, and that belongs to THIS bar — stamping
    // it with the close puts the whole curve one candle to the right, and
    // drags the dates on "worst dip" and "most in play" along with it.
    // The bottom of the candle goes in first, so a fall and a recovery inside
    // one bar is on the curve rather than smoothed away by its close. Only
    // when it is genuinely lower than where the bar finished.
    const worst = worstInBar as {
      t: number
      usd: number
      margin: number
    } | null
    if (worst !== null && worst.usd < figures.equity) {
      // Shifted one bar back like every other point on this curve. The curve
      // names each pot by its bar's OPEN, so a dip stamped with its true
      // minute would carry a LATER time than the close it happened before —
      // and the times would run backwards. `barAt` finds a dragged window's
      // edges by binary search over these times, and the preset views read the
      // bar size off the first two points; both need the times ascending.
      equity.push({ t: worst.t - barMs, usd: worst.usd })
      inPlay.push(worst.margin)
    }
    equity.push({ t: time, usd: figures.equity })
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
      firstAt: firstAt.get(coin.marketKey) ?? null,
      fundingPaid: fundingPaidByMarket.get(coin.marketKey) ?? 0,
      // Heaviest first: the reason that held a coin back for a thousand bars
      // is the answer, and the one that happened twice is a footnote.
      armRefusals: [...(refusalsByMarket.get(coin.marketKey)?.values() ?? [])].sort(
        (left, right) => right.bars - left.bars
      ),
      rungEvents: rungEventsByMarket.get(coin.marketKey) ?? [],
    })),
    equity,
    inPlay,
    endingUsd: equity[equity.length - 1]?.usd ?? input.startingUsd,
    fundingPaid: [...fundingPaidByMarket.values()].reduce(
      (sum, paid) => sum + paid,
      0
    ),
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
  detection: DcaBaseDetection
): number | null {
  // Which bars had closed, then the level already worked out for that one.
  //
  // This used to copy out the closed bars and run the whole indicator over
  // them, on every bar, for every coin without a ladder — which is most coins
  // for most of a run. A hundred coins over six thousand bars spent three
  // minutes here and never placed a single trade; two hundred and fifty coins
  // over ten years never finished at all, and took the server's memory with it.
  const bars = ascending(coin.baseBars)
  const cut = lastClosedIndex(bars, BASE_STOP_BAR_MS, now)
  if (cut < 0) return null
  return baseLevelsInForce(bars, detection)[cut] ?? null
}
