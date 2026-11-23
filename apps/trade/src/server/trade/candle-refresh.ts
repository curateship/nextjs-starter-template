import { asc, max } from "drizzle-orm"

import { parseMarketKey } from "@/lib/protocols/contracts"
import { isHistorySource } from "@/lib/protocols/history-source"
import {
  MOST_BARS_A_CHART_ASKS_FOR,
} from "@/lib/trade/chart-history"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import {
  ensureCandleCoverage,
  fetchableThrough,
} from "@/server/trade/candle-store"
import { tradeCandleCoverage } from "@/server/trade/schema"

/**
 * Keeps the candle store's newest edge current.
 *
 * Every pass looks at what is already in coverage, finds the market and
 * timeframe pairs whose newest stored bar is behind the last closed one, and
 * tops the newest of them up. It never walks a catalogue: a market nobody
 * has charted or tested has no coverage row and is never downloaded.
 *
 * Only the history sources are topped up, which a key says by mapping to
 * itself. Rows an older build stored under a venue's own key are left alone;
 * they are harmless, the chart no longer reads them, and the ten-year sweep
 * removes them in time.
 *
 * Bounded on purpose. One pass spends at most `REQUESTS_PER_PASS` pages, so
 * it can never crowd the trading engine or a backtest out of the shared
 * `PAGES_AT_ONCE` gate. A pair whose newest stored bar is older than the
 * store's own depth for that timeframe is left alone: a backtest over 2022
 * writes minute pieces for 2022, and nobody wants two weeks of this year's
 * minutes for every coin it tested. The chart fills such a pair when
 * somebody opens it. The most-behind pairs go first, so a pair one bar behind
 * on the minute chart cannot hog every pass. Binance's own back-off and
 * Dukascopy's batch pause stay in charge of the pace under that.
 *
 * Bounded in time as well as in requests. A pass stops after
 * `PASS_BUDGET_MS` whatever a slow source is doing, because the worker's
 * health check reads a pass that never ends as a loop that has stopped.
 */
export const REQUESTS_PER_PASS = 20

/**
 * How long a pair whose top-up failed is left alone.
 *
 * On 15 Sep 2026 Dukascopy refused SMH's newest 4-hour window every time.
 * SMH stayed the most-behind pair, so every pass asked for it first, each
 * refusal took about 54 seconds, and the tries piled up in Dukascopy's
 * one-at-a-time line in front of a backtest. A failed pair now rests, and the
 * pass carries on with the next one.
 */
export const FAILED_PAIR_REST_MS = 30 * 60_000

/**
 * How long a whole pass may take before it stops and leaves the rest for the
 * next one.
 *
 * The worker's health check calls the loop stopped when no pass has finished
 * for two minutes, and the beat is written when a pass ends. On 16 Sep 2026 a
 * freshly deployed worker container walked into five Dukascopy refusals in its
 * first pass, about 54 seconds each, so the first pass was still running after
 * four and a half minutes, the container was called unhealthy, and Coolify
 * rolled the deploy back. A restarted container starts with an empty rest list,
 * so it meets every refusal again, which is why this only bites on deploy.
 *
 * Thirty seconds is the whole pass, including the ask in flight when the time
 * runs out: that ask is abandoned and its pair rested, exactly as a refusal is.
 * Nothing is lost by stopping. The next pass is fifteen seconds later and
 * picks up where this one left off, most-behind first.
 */
export const PASS_BUDGET_MS = 30_000

/** Whatever a source states as its page, or the store's default. */
const DEFAULT_PAGE_BARS = 1_000

export type CandleRefreshOutcome = {
  toppedUp: number
  requests: number
}

/** Pairs that failed, by `marketKey interval`, and when they may be asked again. */
const restingUntil = new Map<string, number>()

/**
 * The pass still running, if any.
 *
 * The dev server's ticker starts a pass every fifteen seconds whether or not
 * the last one finished. Without this, a slow source gets a new pass's asks
 * queued behind the old ones every tick.
 */
let passInFlight: Promise<CandleRefreshOutcome> | null = null

export async function refreshCandleStore(
  database: CustomShellDb = db,
  now: number = Date.now(),
  /** Only tests pass this, to prove the budget without waiting for it. */
  budgetMs: number = PASS_BUDGET_MS
): Promise<CandleRefreshOutcome> {
  if (passInFlight) return { toppedUp: 0, requests: 0 }
  passInFlight = topUpStore(database, now, budgetMs)
  try {
    return await passInFlight
  } finally {
    passInFlight = null
  }
}

/** Thrown when the pass's time ran out while an ask was still in flight. */
class OutOfTime extends Error {}

/**
 * The ask, or `OutOfTime` once `ms` has gone by.
 *
 * The ask itself keeps running after that, because a fill cannot be called
 * off and the store finishes writing whatever it downloads. It is only stopped
 * being waited for. A rejection that arrives once nobody is listening is
 * swallowed here rather than crashing the worker as an unhandled rejection.
 */
function giveUpAfter<Result>(ms: number, ask: Promise<Result>): Promise<Result> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const deadline = new Promise<never>((_, fail) => {
    timer = setTimeout(() => fail(new OutOfTime()), ms)
  })
  return Promise.race([ask, deadline]).finally(() => {
    if (timer) clearTimeout(timer)
    ask.catch(() => {})
  })
}

async function topUpStore(
  database: CustomShellDb,
  now: number,
  budgetMs: number
): Promise<CandleRefreshOutcome> {
  const covered = await database
    .select({
      marketKey: tradeCandleCoverage.marketKey,
      interval: tradeCandleCoverage.interval,
      end: max(tradeCandleCoverage.toTime),
    })
    .from(tradeCandleCoverage)
    .groupBy(tradeCandleCoverage.marketKey, tradeCandleCoverage.interval)
    .orderBy(asc(max(tradeCandleCoverage.toTime)))

  const startedAt = Date.now()
  let requests = 0
  let toppedUp = 0
  let ranOut = false
  for (const row of covered) {
    if (requests >= REQUESTS_PER_PASS) break
    if (Date.now() - startedAt >= budgetMs) {
      ranOut = true
      break
    }
    if (row.end === null || !isHistorySource(row.marketKey)) continue
    const pair = `${row.marketKey} ${row.interval}`
    if ((restingUntil.get(pair) ?? 0) > now) continue
    const ref = parseMarketKey(row.marketKey)
    if (!ref) continue

    const source = getProtocol(ref.protocol).markets
    const step = source.intervalMs(row.interval)
    // The bar still forming is never stored; the last closed one ends here,
    // or earlier where the source has not published up to it yet.
    const to = Math.min(
      Math.floor(now / step) * step,
      fetchableThrough(row.marketKey, row.interval, now)
    )
    if (row.end >= to) continue
    // Behind by more than the store holds: not live, leave it for a chart.
    if (row.end < to - MOST_BARS_A_CHART_ASKS_FOR * step) continue

    const pageMs = step * (source.historyBatchBars ?? DEFAULT_PAGE_BARS)
    const room = REQUESTS_PER_PASS - requests
    const from = Math.max(row.end, to - room * pageMs)
    const pages = Math.ceil((to - from) / pageMs)

    // Counted before the ask, so a failed pair still spends its share.
    requests += pages
    try {
      await giveUpAfter(
        Math.max(1, budgetMs - (Date.now() - startedAt)),
        ensureCandleCoverage(row.marketKey, row.interval, from, to, database)
      )
    } catch (error) {
      // A pair that ran the pass out of time rests like a refused one. It was
      // the slowest thing in the queue and it is first in line next pass, so
      // without the rest it would run the next pass out of time as well.
      restingUntil.set(pair, now + FAILED_PAIR_REST_MS)
      if (error instanceof OutOfTime) {
        ranOut = true
        console.warn(
          `[candle-refresh] ${pair} was still going when the pass's ${
            budgetMs / 1000
          }s ran out, left alone for ${FAILED_PAIR_REST_MS / 60_000} minutes`
        )
        break
      }
      console.warn(
        `[candle-refresh] ${pair} failed, left alone for ${FAILED_PAIR_REST_MS / 60_000} minutes: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      continue
    }
    toppedUp += 1
  }

  if (ranOut) {
    console.info(
      `[candle-refresh] pass stopped after ${budgetMs / 1000}s with ${toppedUp} topped up; the next pass carries on`
    )
  }

  if (toppedUp > 0) {
    console.info(
      `[candle-refresh] topped up ${toppedUp} market timeframes with ${requests} requests (cap ${REQUESTS_PER_PASS})`
    )
  }
  return { toppedUp, requests }
}
