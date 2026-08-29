import { and, eq } from "drizzle-orm"
import { performance } from "node:perf_hooks"

import { parseMarketKey } from "@/lib/protocols/contracts"
import { firstOpenAtOrAfter } from "@/lib/trade/candle-window"
import {
  BACKTEST_STOPPED_EARLY,
  coinWorstDip,
  middleOf,
  pairTrades,
  sideStatsFromTrades,
  worstDip,
  type BacktestCoinSummary,
  type BacktestResult,
  type BacktestPreparation,
  type BacktestSkip,
  type BacktestSpecSnapshot,
  type BacktestFill,
  type BacktestSummary,
  type BacktestTrade,
} from "@/lib/trade/backtest/result"
import {
  BASE_STOP_BAR_MS,
  BASE_STOP_BARS,
  BASE_STOP_INTERVAL,
  dcaParamsSchema,
} from "@/lib/trade/dca"
import {
  indicatorSettingsSchema,
  indicatorWarmupBars,
} from "@/lib/trade/indicators/registry"
import { db } from "@/server/db"
import { createBarZoom } from "./zoom"
import {
  ensureCandleCoverage,
  listCandleGaps,
  loadStoredCandles,
} from "@/server/trade/candle-store"
import {
  ensureFundingCoverage,
  listFundingGaps,
  loadStoredFunding,
} from "@/server/trade/funding-store"
import { replayMarketRules } from "@/server/trade/market-rules"
import { INTERVAL_MS } from "@/server/trade/smart-engine"
import { runBacktest, type BacktestCoin } from "@/server/trade/backtest/engine"
import {
  backtestCosts,
  backtestStopRequested,
  claimBacktestGroup,
  failBacktestGroup,
  failStuckBacktests,
  heartbeatBacktestGroup,
  releaseBacktestGroup,
  releaseFailedBacktestGroup,
  replaceUnnamedRuns,
  saveBacktestResult,
  type ClaimedGroup,
} from "@/server/trade/backtest/store"
import { tradeBacktests } from "@/server/trade/schema"

/**
 * The background pass that actually runs a backtest.
 *
 * The shell ticks every fifteen seconds and this rides that loop. One tick
 * claims one run and does a bounded amount of work, then lets go — so a
 * ninety-day test over twenty coins never sits inside one request holding the
 * server up, and a restart in the middle of one is recovered rather than lost.
 *
 * A run has three stages, and they are in this order because only the first is
 * slow:
 *
 * 1. **Loading candles**, a few coins per tick. This is the only part that
 *    talks to the exchange, and the candle store means it only ever happens
 *    once per stretch of history.
 * 2. **Running the strategy** — the whole walk, in memory, in one go. It reads
 *    nothing over the network, so there is nothing to spread over ticks.
 * 3. **Saving results**, worked out once and written.
 *
 * Stopping is checked between coins while loading and between chunks while
 * walking. Coins already finished keep their results; the rest say they were
 * stopped before they were reached, which is the truth.
 */

/**
 * How many coins are fetched at once.
 *
 * All of them are fetched in ONE pass, a few at a time — not a handful per
 * fifteen-second tick, which is what this used to do and why a fifty-coin run
 * took minutes of doing nothing. The fetching itself is seconds; the waiting
 * was the run.
 *
 * Six at a time rather than all fifty: each protocol adapter applies its own
 * request spacing, and this keeps the server from holding hundreds of loading
 * promises at once.
 */
const FETCH_AT_ONCE = 6
/** Two full histories at once keeps the read-side peak below the old duplicate. */
const PREPARE_AT_ONCE = 2
/** Two warning reads per coin fill the default ten-connection pool. */
const WARNING_COINS_AT_ONCE = 5
const HEARTBEAT_MS = 60_000

async function mapInBatches<Input, Output>(
  values: readonly Input[],
  batchSize: number,
  work: (value: Input) => Promise<Output>,
  afterOne: () => void = () => {}
): Promise<Output[]> {
  const output: Output[] = []
  for (let at = 0; at < values.length; at += batchSize) {
    const batch = await Promise.all(
      values.slice(at, at + batchSize).map(async (value) => {
        try {
          return await work(value)
        } finally {
          afterOne()
        }
      })
    )
    output.push(...batch)
  }
  return output
}

/**
 * How far before the window a signals run has to be able to see, in candles of
 * its own interval.
 *
 * Zero for a ladder run, which reads its history off the 4h base feed instead.
 * Written once because two places need it — the fetch, which has to put those
 * candles in the store, and the walk, which reads them back — and a fetch that
 * disagreed with the read would leave the walk quietly warm-up-less again.
 */
function signalWarmupCount(spec: BacktestSpecSnapshot): number {
  if (spec.strategy.kind !== "signals") return 0
  return indicatorWarmupBars(
    indicatorSettingsSchema.parse(spec.strategy.indicators)
  )
}

function signalWarmupFrom(spec: BacktestSpecSnapshot): number {
  return spec.from - signalWarmupCount(spec) * INTERVAL_MS[spec.interval]
}

export async function backtestTick(now: number = Date.now()): Promise<void> {
  // Anything that ran out of tries says so, rather than sitting at "running"
  // for ever because nothing will claim it again.
  await failStuckBacktests(now)

  const claimed = await claimBacktestGroup(now)
  if (!claimed) return

  const { userId, groupId } = claimed
  let heartbeatFailure: unknown = null
  let heartbeatTail: Promise<void> = Promise.resolve()
  const heartbeat = setInterval(() => {
    heartbeatTail = heartbeatTail.then(async () => {
      if (heartbeatFailure) return
      try {
        await heartbeatBacktestGroup(userId, groupId, claimed.attempts)
      } catch (error) {
        heartbeatFailure = error
      }
    })
  }, HEARTBEAT_MS)
  heartbeat.unref()

  try {
    if (await backtestStopRequested(userId, groupId)) {
      await finish(claimed, Date.now(), [], [], null)
      return
    }

    const pending = await db
      .select({
        marketKey: tradeBacktests.marketKey,
        status: tradeBacktests.status,
        candlesReady: tradeBacktests.candlesReady,
      })
      .from(tradeBacktests)
      .where(
        and(
          eq(tradeBacktests.userId, userId),
          eq(tradeBacktests.groupId, groupId)
        )
      )

    const toLoad = pending
      .filter((coin) => !coin.candlesReady && coin.status !== "skipped")
      .map((coin) => coin.marketKey)
      .sort()

    if (toLoad.length > 0) {
      await loadSomeCandles(claimed, toLoad)
      // Straight on into the walk in the same pass. Letting go here and waiting
      // for the next tick is what made a fifty-coin run take minutes: the work
      // is seconds, and the fifteen seconds between ticks was the rest of it.
      if (await backtestStopRequested(userId, groupId)) {
        await releaseBacktestGroup(userId, groupId, claimed.attempts)
        return
      }
    }

    await walkAndSave(claimed)
  } catch (error) {
    // Three tries and it says so. Below that the claim is simply released and
    // the next tick has another go — a stumbling exchange should not lose a run.
    const message =
      error instanceof Error ? error.message : "The run could not be finished."
    // **Being told to slow down is not a failure of the run.** The exchange
    // rations us, refuses everything for twenty seconds, and the next tick
    // comes round sooner than that — so all three tries were spent inside one
    // hold and a 426-coin run died in four minutes without a single coin
    // being at fault. A rationed pass hands the run back untouched instead,
    // and the next tick carries on from where the coins already are.
    if (message.includes("EXCHANGE_BUSY")) {
      await releaseBacktestGroup(userId, groupId, claimed.attempts)
      return
    }
    if (claimed.attempts >= 3) {
      await failBacktestGroup(userId, groupId, message, Date.now())
      return
    }
    // Leaves the count where the claim put it — this pass did not finish, so
    // it has to leave a mark or the run retries for ever.
    await releaseFailedBacktestGroup(userId, groupId, claimed.attempts)
    throw error
  } finally {
    clearInterval(heartbeat)
    await heartbeatTail
  }
  if (heartbeatFailure) throw heartbeatFailure
}

/**
 * Fetches the history a few coins need, and skips — out loud — any coin the
 * exchange cannot cover.
 *
 * A coin younger than the window is not an error and must not be an absence
 * either. It becomes a skipped row saying when its prices actually start, so
 * "twelve of twenty coins made money" can never quietly mean twelve of the
 * twelve that happened to have history.
 */
async function loadSomeCandles(
  claimed: { userId: string; groupId: string; spec: BacktestSpecSnapshot },
  marketKeys: readonly string[]
): Promise<void> {
  const { userId, groupId, spec } = claimed
  const warmFrom = spec.from - BASE_STOP_BARS * BASE_STOP_BAR_MS

  // A few at a time, rather than one after another: each coin is two network
  // reads and nothing else, so waiting for one before starting the next is
  // almost all of the wall-clock for no reason.
  for (let at = 0; at < marketKeys.length; at += FETCH_AT_ONCE) {
    if (await backtestStopRequested(userId, groupId)) return
    await Promise.all(
      marketKeys
        .slice(at, at + FETCH_AT_ONCE)
        .map((marketKey) => loadOneCoin(userId, groupId, spec, marketKey, warmFrom))
    )
  }
}

/**
 * One coin's history, and the honest reasons it might not be testable.
 *
 * A coin that cannot be tested is **skipped with its reason**, never left out:
 * "twenty-nine of fifty coins made money" must never quietly mean twenty-nine
 * of the twenty-nine that happened to have history.
 */
async function loadOneCoin(
  userId: string,
  groupId: string,
  spec: BacktestSpecSnapshot,
  marketKey: string,
  warmFrom: number
): Promise<void> {
  const ref = parseMarketKey(marketKey)
  if (!ref) {
    await skipCoin(
      userId,
      groupId,
      marketKey,
      "This is not a market this app knows."
    )
    return
  }

  await note(userId, groupId, marketKey, 0.1, "Loading market history")

  const window = await ensureCandleCoverage(
    marketKey,
    spec.interval,
    spec.from,
    spec.to
  )
  // The base rule reads the 4h whatever the run walks, and it needs history
  // from before the window so a level can already be known on day one.
  await ensureCandleCoverage(marketKey, BASE_STOP_INTERVAL, warmFrom, spec.to)
  // A signals run needs the same head start at its OWN interval. Its own call
  // rather than a wider window above, so the "no history for this coin" answer
  // still comes from exactly the stretch being tested.
  const signalFrom = signalWarmupFrom(spec)
  if (signalFrom < spec.from) {
    await ensureCandleCoverage(marketKey, spec.interval, signalFrom, spec.from)
  }
  await ensureFundingCoverage(marketKey, spec.from, spec.to)

  if (window.barCount === 0) {
    await skipCoin(
      userId,
      groupId,
      marketKey,
      "There is no price history for this coin over this window."
    )
    return
  }
  // A coin younger than the window is TESTED FROM THE DAY IT EXISTED, not
  // thrown away.
  //
  // The window is a MAXIMUM — "go back as far as this" — so a younger market
  // is tested from the day its selected exchange first has prices for it.
  //
  // The engine needs nothing for this. It walks the union of every coin's bar
  // times and skips a coin on a bar it does not have, so a coin that lists
  // half way through simply does nothing until it exists. What it does mean is
  // that a late coin joins a pot the earlier ones have already been trading —
  // which is true of real money too, and is why the window it actually got is
  // recorded below rather than left to be guessed at.

  await db
    .update(tradeBacktests)
    .set({
      candlesReady: true,
      status: "running",
      progress: 0.3,
      progressNote: "Waiting for the strategy",
    })
    .where(
      and(
        eq(tradeBacktests.userId, userId),
        eq(tradeBacktests.groupId, groupId),
        eq(tradeBacktests.marketKey, marketKey)
      )
    )
}

/** The walk itself, then the numbers, then one write. */
async function walkAndSave(claimed: ClaimedGroup): Promise<void> {
  const { userId, groupId, spec } = claimed

  const ready = await db
    .select({
      marketKey: tradeBacktests.marketKey,
      symbol: tradeBacktests.symbol,
      status: tradeBacktests.status,
    })
    .from(tradeBacktests)
    .where(
      and(
        eq(tradeBacktests.userId, userId),
        eq(tradeBacktests.groupId, groupId)
      )
    )

  const testable = ready.filter((coin) => coin.status !== "skipped")
  const skipped: BacktestSkip[] = []

  const first = parseMarketKey(testable[0]?.marketKey ?? spec.marketKeys[0])
  if (!first) throw new Error("BACKTEST_MARKET")
  const protocol = first.protocol
  const network = first.network

  const heapStartBytes = process.memoryUsage().heapUsed
  let heapHighWaterBytes = heapStartBytes
  const sampleHeap = () => {
    heapHighWaterBytes = Math.max(
      heapHighWaterBytes,
      process.memoryUsage().heapUsed
    )
  }
  const preparationStartedAt = performance.now()
  const prepared = await mapInBatches(
    testable,
    PREPARE_AT_ONCE,
    async (
      coin
    ): Promise<{ coin: BacktestCoin } | { skip: BacktestSkip } | null> => {
      const ref = parseMarketKey(coin.marketKey)
      if (!ref) return null
      const signalFrom = signalWarmupFrom(spec)

      try {
        const [rules, baseBars, warmupBars, windowBars, funding] =
          await Promise.all([
            replayMarketRules(protocol, network, ref.marketId),
            // The base rule always reads 4h, so a run that IS on 4h wants the
            // same candles for its warm history and window. The window below
            // slices this one list instead of holding a duplicate.
            loadStoredCandles(
              coin.marketKey,
              BASE_STOP_INTERVAL,
              spec.from - BASE_STOP_BARS * BASE_STOP_BAR_MS,
              spec.to
            ),
            // Indicator warm-up is bounded by the settings that are on.
            signalFrom < spec.from
              ? loadStoredCandles(
                  coin.marketKey,
                  spec.interval,
                  signalFrom,
                  spec.from
                )
              : Promise.resolve([]),
            spec.interval === BASE_STOP_INTERVAL
              ? Promise.resolve(null)
              : loadStoredCandles(
                  coin.marketKey,
                  spec.interval,
                  spec.from,
                  spec.to
                ),
            loadStoredFunding(coin.marketKey, spec.from, spec.to),
          ])

        if (!rules) {
          return {
            skip: {
              marketKey: coin.marketKey,
              symbol: coin.symbol,
              reason: "The exchange no longer lists this coin.",
            },
          }
        }

        return {
          coin: {
            marketKey: coin.marketKey,
            symbol: coin.symbol,
            rules,
            warmupBars,
            bars:
              windowBars ??
              baseBars.slice(firstOpenAtOrAfter(baseBars, spec.from)),
            baseBars,
            funding,
          },
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The stored history read failed."
        throw new Error(`Preparing ${coin.symbol} failed: ${message}`, {
          cause: error,
        })
      }
    },
    sampleHeap
  )
  sampleHeap()

  const coins: BacktestCoin[] = []
  for (const result of prepared) {
    if (!result) continue
    if ("skip" in result) skipped.push(result.skip)
    else coins.push(result.coin)
  }
  const preparation: BacktestPreparation = {
    coinCount: testable.length,
    batchSize: PREPARE_AT_ONCE,
    durationMs: performance.now() - preparationStartedAt,
    heapStartBytes,
    heapHighWaterBytes,
  }

  await noteAll(userId, groupId, 0.4, "Running the strategy")

  // Re-read rather than trusted: the snapshot is jsonb written by whichever
  // build recorded the run, and the walk is about to spend a pot on it.
  const strategy =
    spec.strategy.kind === "dca"
      ? { kind: "dca" as const, params: dcaParamsSchema.parse(spec.strategy.params) }
      : {
          kind: "signals" as const,
          indicators: indicatorSettingsSchema.parse(spec.strategy.indicators),
          stakePct: spec.strategy.stakePct,
          chaseGiveUp: spec.strategy.chaseGiveUp,
        }
  // Real minute prices for the bars a coin was actually holding or resting
  // something in. Everything else is walked whole, exactly as before.
  const zoom = createBarZoom()
  const outcome = await runBacktest(
    {
      protocol,
      network,
      startingUsd: spec.startingUsd,
      costs: backtestCosts(spec),
      strategy,
      interval: spec.interval,
      coins,
      from: spec.from,
      to: spec.to,
      zoomIn: zoom.read,
    },
    {
      shouldStop: () => backtestStopRequested(userId, groupId),
      onProgress: (fraction) =>
        noteAll(
          userId,
          groupId,
          0.4 + fraction * 0.55,
          // The first run over a window fetches minute prices for the days a
          // ladder was live, which takes far longer than the walk itself. Say
          // so, or a run that is working looks like a run that has hung.
          zoom.zoomedBars() > 0
            ? `Running the strategy — reading minute prices (${zoom.zoomedBars()} bars so far)`
            : "Running the strategy"
        ),
    }
  )

  await noteAll(userId, groupId, 0.97, "Saving results")
  await finish(
    claimed,
    Date.now(),
    coins,
    skipped,
    outcome,
    zoom.coinsWithoutMinutes(),
    preparation
  )
}

type Outcome = Awaited<ReturnType<typeof runBacktest>>

/** Works the numbers out once, writes them, and clears the flow's old run. */
async function finish(
  claimed: ClaimedGroup,
  now: number,
  coins: readonly BacktestCoin[],
  skippedByRules: readonly BacktestSkip[],
  outcome: Outcome | null,
  /** Coins the exchange publishes no minute prices for. */
  withoutMinutes: readonly string[] = [],
  preparation?: BacktestPreparation
): Promise<void> {
  const { userId, groupId, spec } = claimed

  const rows = await db
    .select({
      marketKey: tradeBacktests.marketKey,
      symbol: tradeBacktests.symbol,
      status: tradeBacktests.status,
      skipReason: tradeBacktests.skipReason,
    })
    .from(tradeBacktests)
    .where(
      and(
        eq(tradeBacktests.userId, userId),
        eq(tradeBacktests.groupId, groupId)
      )
    )

  const skipped: BacktestSkip[] = [
    ...rows
      .filter((row) => row.status === "skipped")
      .map((row) => ({
        marketKey: row.marketKey,
        symbol: row.symbol,
        reason: row.skipReason ?? "Skipped.",
      })),
    ...skippedByRules,
  ]

  const perCoin = new Map(
    (outcome?.coins ?? []).map((coin) => [coin.marketKey, coin])
  )
  const coinSummaries: BacktestCoinSummary[] = []
  const writes: Array<{
    marketKey: string
    status: "done" | "skipped" | "stopped"
    skipReason: string | null
    summary: BacktestCoinSummary | null
    trades: BacktestTrade[] | null
    fills: BacktestFill[] | null
  }> = []

  for (const row of rows) {
    const skip = skipped.find((one) => one.marketKey === row.marketKey)
    if (skip) {
      writes.push({
        marketKey: row.marketKey,
        status: "skipped",
        skipReason: skip.reason,
        summary: null,
        trades: null,
        fills: null,
      })
      continue
    }

    const walked = perCoin.get(row.marketKey)
    if (!walked) {
      writes.push({
        marketKey: row.marketKey,
        status: "stopped",
        skipReason: null,
        summary: null,
        trades: null,
        fills: null,
      })
      continue
    }

    // Both shapes are kept, because the two halves of the page want different
    // ones: the chart draws an arrow per FILL, at the price and moment it
    // happened, and the table lists ROUND TRIPS. Deriving either from the other
    // on the page would blend a five-rung ladder into one averaged entry, which
    // hides the whole shape of it.
    //
    // The fills are saved as plain FACTS — price, size, fee, which rung — and
    // never as the sentence the tooltip shows. The sentence used to be written
    // here, which quietly meant every change to the wording needed the whole
    // backtest run again before anyone could see it.
    const engineFills: BacktestFill[] = walked.fills.map((one) => ({
      at: one.fillTime,
      side: one.side === "sell" ? ("sell" as const) : ("buy" as const),
      px: one.px,
      sz: one.sz,
      fee: one.fee,
      closedPnl: one.closedPnl,
      reason: one.reason,
      rung: one.rung,
    }))
    const trades: BacktestTrade[] = pairTrades(engineFills)
    // Banked, straight off the fills rather than off the pairing: this is what
    // the wallet actually took, whatever the pairing did with a part-closed
    // rung.
    const banked = walked.fills.reduce(
      (sum, one) => sum + one.closedPnl - one.fee,
      0
    )
    // **Plus whatever it is still holding, at the last price.**
    //
    // Without this the column is a lie on exactly the strategy it is here to
    // test. A DCA ladder only ever sells at a profit, so every realised trade
    // is a winner and every loss is still in the position — a run of fifty
    // coins reported no losers at all, because thirty-two of them had never
    // closed anything and thirteen were holding a bag. The pot line already
    // counted these, so the two numbers disagreed as well.
    const openPnl =
      walked.openAtEnd && walked.lastPx !== null
        ? (walked.lastPx - walked.openAtEnd.entryPx) * walked.openAtEnd.szi
        : 0
    const madeOrLost = banked + openPnl - walked.fundingPaid
    const closed = trades.filter((trade) => trade.exitAt !== null)
    const openAtEndUsd = walked.openAtEnd
      ? Math.abs(walked.openAtEnd.szi) * (walked.lastPx ?? walked.openAtEnd.entryPx)
      : 0
    // Just buying this coin at the start and holding to the end.
    //
    // **The same pot, split evenly — not a full stake each.** This used to be
    // the share ONE ladder may spend on ONE coin, and every coin's figure was
    // then added up for the run's total. Five per cent of ten thousand is five
    // hundred, so a hundred and fifty coins came to seventy-five thousand
    // pounds spent out of a ten thousand pound pot, and the comparison could
    // report a loss several times larger than the money that existed.
    //
    // Splitting the pot is what "just buy and hold instead" actually means:
    // the same money, the same coins, no ladder. It also makes the two halves
    // comparable, which is the only reason the column is here.
    // The coins the engine actually walked — a skipped coin never had money
    // put into it, so it must not take a share of the pot away from one that
    // did.
    const stake = spec.startingUsd / Math.max(1, perCoin.size)
    const buyAndHold =
      walked.firstPx && walked.lastPx && walked.firstPx > 0
        ? stake * (walked.lastPx / walked.firstPx - 1)
        : 0

    // The exchange's own endings, kept apart from every other loss: the ladder
    // has no answer to one, where a stop at least leaves the money behind.
    const liquidated = trades.filter(
      (trade) => trade.exitReason === "liquidated"
    )

    const summary: BacktestCoinSummary = {
      marketKey: row.marketKey,
      symbol: row.symbol,
      madeOrLost,
      fundingPaid: walked.fundingPaid,
      trades: trades.length,
      won: closed.filter((trade) => trade.pnl > 0).length,
      closed: closed.length,
      liquidated: liquidated.length,
      liquidatedUsd: liquidated.reduce((sum, trade) => sum + trade.pnl, 0),
      // Why it never got a ladder, when it never did. A coin the engine walked
      // but never armed used to be a blank row with nothing to ask.
      armRefusals: walked.armRefusals,
      // What was actually on the book, so "price went through rung 5 and
      // nothing happened" is a lookup rather than an afternoon.
      rungEvents: walked.rungEvents,
      worstDipUsd: coinWorstDip(trades),
      // Only when it is later than the window's own start. A coin that covered
      // the whole test has nothing to say here.
      startedAt:
        walked.firstAt !== null && walked.firstAt > spec.from
          ? walked.firstAt
          : null,
      openAtEndUsd,
      buyAndHold,
      stats: sideStatsFromTrades(
        trades,
        walked.fills.reduce((sum, one) => sum + one.fee, 0)
      ),
    }
    coinSummaries.push(summary)
    writes.push({
      marketKey: row.marketKey,
      status: "done",
      skipReason: null,
      summary,
      trades,
      fills: engineFills,
    })
  }

  const equity = outcome?.equity ?? []
  const dip = worstDip(equity)
  const peak = peakInPlay(equity, outcome?.inPlay ?? [], spec.startingUsd)
  const shares = inPlayShares(equity, outcome?.inPlay ?? [], spec.startingUsd)
  const endingUsd = outcome?.endingUsd ?? spec.startingUsd
  const warnings = await credibilityWarnings(
    spec,
    coins,
    outcome,
    skipped,
    withoutMinutes
  )

  const summary: BacktestSummary = {
    startingUsd: spec.startingUsd,
    endingUsd,
    madeOrLost: endingUsd - spec.startingUsd,
    madeOrLostPct:
      spec.startingUsd > 0
        ? ((endingUsd - spec.startingUsd) / spec.startingUsd) * 100
        : 0,
    fundingPaid: outcome?.fundingPaid ?? 0,
    worstDipUsd: dip.usd,
    worstDipAt: dip.at,
    worstDipPct: dip.peak > 0 ? (dip.usd / dip.peak) * 100 : null,
    worstDipPeakUsd: dip.peak > 0 ? dip.peak : null,
    coinsTested: coinSummaries.length,
    coinsSkipped: skipped.length,
    coinsThatMadeMoney: coinSummaries.filter((coin) => coin.madeOrLost > 0)
      .length,
    peakInPlayUsd: peak.usd,
    peakInPlayPct: peak.pct,
    peakInPlayAt: peak.at,
    peakInPlayHeldMs: peak.heldMs,
    typicalInPlayUsd: middleOf(outcome?.inPlay ?? []),
    // Null rather than zero when there is no pot to take a share of, so the
    // tile shows a dash like every other figure a run cannot answer.
    typicalInPlayPct: shares.length > 0 ? middleOf(shares) : null,
    potAtWorstDipUsd:
      dip.at === null
        ? null
        : (equity.find((point) => point.t === dip.at)?.usd ?? null),
    coinsOpenAtEnd: coinSummaries.filter((coin) => coin.openAtEndUsd > 0).length,
    openAtEndUsd: coinSummaries.reduce(
      (sum, coin) => sum + coin.openAtEndUsd,
      0
    ),
    buyAndHold: coinSummaries.reduce((sum, coin) => sum + coin.buyAndHold, 0),
    trades: coinSummaries.reduce((sum, coin) => sum + coin.trades, 0),
    tradesClosed: coinSummaries.reduce((sum, coin) => sum + coin.closed, 0),
    tradesWon: coinSummaries.reduce((sum, coin) => sum + coin.won, 0),
    tradesLiquidated: coinSummaries.reduce(
      (sum, coin) => sum + coin.liquidated,
      0
    ),
    liquidatedUsd: coinSummaries.reduce(
      (sum, coin) => sum + coin.liquidatedUsd,
      0
    ),
    warnings,
  }

  const result: BacktestResult = {
    // Every bar is 540 points over ninety days at 4h — small enough to keep
    // whole, so the line on the run page is the line the run actually walked.
    equity,
    // Kept beside the pot's own line so the two wallet figures on the results
    // page can be checked against something. They used to be the only numbers
    // there that could not be recomputed from what was saved.
    inPlay: outcome?.inPlay ?? [],
    // The coin summaries WITHOUT their two long lists.
    //
    // Every coin already carries its own summary on its own row, which is what
    // every screen reads — nothing anywhere reads this copy. It stays because
    // the shape is stored and read back by older runs, but there is no reason
    // for it to carry a second copy of every rung change and every refusal:
    // 4,259 rung events on a 154-coin run, written twice, in a blob the run
    // page loads whole.
    coins: coinSummaries.map((coin) => ({
      ...coin,
      armRefusals: [],
      rungEvents: [],
    })),
    skipped,
    ...(preparation ? { preparation } : {}),
  }

  await saveBacktestResult(
    userId,
    groupId,
    { attempt: claimed.attempts, summary, result, coins: writes, now },
    db
  )
  await replaceUnnamedRuns(userId, claimed.automationId, groupId)
}

/**
 * What makes this result less believable, in plain words.
 *
 * Written onto the run rather than left for somebody to notice. A backtest that
 * reports a number and stays quiet about the holes in its data is the most
 * expensive kind of wrong.
 */
async function credibilityWarnings(
  spec: BacktestSpecSnapshot,
  coins: readonly BacktestCoin[],
  outcome: Outcome | null,
  skipped: readonly BacktestSkip[],
  withoutMinutes: readonly string[] = []
): Promise<string[]> {
  const warnings: string[] = []

  if (outcome?.stoppedEarly) {
    warnings.push(BACKTEST_STOPPED_EARLY)
  }
  if (skipped.length > 0) {
    warnings.push(
      `${skipped.length} of ${spec.marketKeys.length} coins were skipped, so this is about the ones that had history.`
    )
  }

  const gapReports = await mapInBatches(
    coins,
    WARNING_COINS_AT_ONCE,
    async (coin) => {
      const [candleGaps, fundingGaps] = await Promise.all([
        listCandleGaps(coin.marketKey, spec.interval, spec.from, spec.to),
        listFundingGaps(coin.marketKey, spec.from, spec.to),
      ])
      return {
        symbol: coin.symbol,
        candlesMissing: candleGaps.length > 0,
        fundingMissing: fundingGaps.length > 0,
      }
    }
  )

  const holed = gapReports
    .filter((report) => report.candlesMissing)
    .map((report) => report.symbol)
  if (holed.length > 0) {
    // The COUNT first, then the names. It used to lead with five symbols and
    // trail off in "and 81 more", which reads as a handful of oddities when it
    // was 86 of the 154 coins the result is built from.
    warnings.push(
      `${holed.length} of ${coins.length} coins had stretches with no prices — ${holed.slice(0, 5).join(", ")}${holed.length > 5 ? ` and ${holed.length - 5} more` : ""}. Those stretches were not traded.`
    )
  }

  const fundingMissing = gapReports
    .filter((report) => report.fundingMissing)
    .map((report) => report.symbol)
  if (fundingMissing.length > 0) {
    warnings.push(
      `${fundingMissing.length} of ${coins.length} coins had stretches with no funding history — ${fundingMissing.slice(0, 5).join(", ")}${fundingMissing.length > 5 ? ` and ${fundingMissing.length - 5} more` : ""}. Those charges are missing from this result, not assumed to be free.`
    )
  }

  if (withoutMinutes.length > 0) {
    const names = withoutMinutes.map((marketKey) => marketKey.split(":").pop())
    warnings.push(
      `${withoutMinutes.length} of ${coins.length} coins had no minute prices — ${names.slice(0, 5).join(", ")}${names.length > 5 ? ` and ${names.length - 5} more` : ""}. Their busy candles were read as one straight move rather than what really happened inside them.`
    )
  }

  const trades = outcome?.coins.reduce(
    (sum, coin) => sum + coin.fills.length,
    0
  )
  if (trades !== undefined && trades < 20) {
    warnings.push(
      `Only ${trades} trades happened, which is too few to tell a good strategy from a lucky month.`
    )
  }

  return warnings
}

/**
 * The wallet this bar's trades were paid for out of — the pot as it stood
 * **before** the bar, which is the previous bar's close.
 *
 * Never this bar's own close. Money is committed at the start of a bar, so the
 * bar's closing pot already contains whatever those very trades just made or
 * lost. On a cascade the difference is the whole answer: Oct 10 2025 put
 * $14,132 to work out of $14,178 — every dollar there was — and the same bar
 * closed at $29,332 because the coins it had just bought at the lows were
 * marked up before the candle finished. Divided by the close that reads 48%,
 * and 48% says there was plenty of room when there was $46 left.
 */
function walletBefore(
  equity: readonly { t: number; usd: number }[],
  startingUsd: number,
  index: number
): number | null {
  const pot = index === 0 ? startingUsd : equity[index - 1]?.usd
  // A wallet at or below zero has no share to take: dividing would invent a
  // number rather than answer the question.
  return typeof pot === "number" && pot > 0 ? pot : null
}

/** What share of the wallet was in trades at each bar, where the wallet is known. */
function inPlayShares(
  equity: readonly { t: number; usd: number }[],
  inPlay: readonly number[],
  startingUsd: number
): number[] {
  const shares: number[] = []
  for (const [index, amount] of inPlay.entries()) {
    const pot = walletBefore(equity, startingUsd, index)
    if (pot === null) continue
    shares.push((amount / pot) * 100)
  }
  return shares
}

/**
 * The moment the wallet was stretched furthest, what was in trades then, and
 * how long it stayed there.
 *
 * This tile answers one question — **did the run have enough money** — so both
 * halves of the fraction have to be about the money it had. See `walletBefore`
 * for the denominator, which is the reason a cascade day no longer reads as a
 * quiet one.
 *
 * **Found by share, not by dollars.** With compounding on, the biggest dollar
 * figure is usually just the latest one, because by then the wallet is bigger
 * too. The tightest moment is the one that nearly ran out, whenever it was.
 *
 * "Held" is counted in real time over the bars that were within a whisker of
 * the peak, because a peak that lasted one candle and one that lasted a week
 * are very different risks wearing the same number.
 *
 * A share of zero and no share at all are different answers and stay different:
 * a run that bought nothing used 0% of its wallet, which is worth saying, while
 * a run with no wallet to divide by cannot be asked and reads as a dash.
 */
export function peakInPlay(
  equity: readonly { t: number; usd: number }[],
  inPlay: readonly number[],
  startingUsd: number
): { usd: number; pct: number | null; at: number | null; heldMs: number } {
  const shares = inPlayShares(equity, inPlay, startingUsd)
  if (shares.length === 0) return { usd: 0, pct: null, at: null, heldMs: 0 }

  let pct = 0
  let usd = 0
  let at: number | null = null
  for (const [index, amount] of inPlay.entries()) {
    const pot = walletBefore(equity, startingUsd, index)
    if (pot === null) continue
    const share = (amount / pot) * 100
    if (share > pct) {
      pct = share
      usd = amount
      at = equity[index]?.t ?? null
    }
  }
  // Nothing was ever in trades. That is 0%, on no particular day.
  if (pct <= 0) return { usd: 0, pct: 0, at: null, heldMs: 0 }

  // A bar counts as "at the peak" when it is within a tenth of a percent of it.
  const near = shares.filter((share) => share >= pct * 0.999).length
  const barMs =
    equity.length > 1 ? Math.max(0, equity[1].t - equity[0].t) : 0
  return { usd, pct, at, heldMs: near * barMs }
}

async function skipCoin(
  userId: string,
  groupId: string,
  marketKey: string,
  reason: string
): Promise<void> {
  await db
    .update(tradeBacktests)
    .set({
      status: "skipped",
      skipReason: reason,
      progress: 1,
      progressNote: "Skipped",
    })
    .where(
      and(
        eq(tradeBacktests.userId, userId),
        eq(tradeBacktests.groupId, groupId),
        eq(tradeBacktests.marketKey, marketKey)
      )
    )
}

async function note(
  userId: string,
  groupId: string,
  marketKey: string,
  progress: number,
  progressNote: string
): Promise<void> {
  await db
    .update(tradeBacktests)
    .set({ status: "running", progress, progressNote })
    .where(
      and(
        eq(tradeBacktests.userId, userId),
        eq(tradeBacktests.groupId, groupId),
        eq(tradeBacktests.marketKey, marketKey)
      )
    )
}

async function noteAll(
  userId: string,
  groupId: string,
  progress: number,
  progressNote: string
): Promise<void> {
  await db
    .update(tradeBacktests)
    .set({ progress, progressNote })
    .where(
      and(
        eq(tradeBacktests.userId, userId),
        eq(tradeBacktests.groupId, groupId),
        eq(tradeBacktests.status, "running")
      )
    )
}
