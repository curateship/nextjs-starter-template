import { z } from "zod"

import type {
  CandleBar,
  CandleInterval,
  NetworkId,
} from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/hyperliquid/translate"
import { infoClient } from "@/server/protocols/hyperliquid/client"

/**
 * Price history from Hyperliquid — the same public, read-only door the market
 * list uses, so everything said in `markets.ts` about the fence holds here.
 *
 * The exchange keeps roughly 5,000 bars per timeframe; this asks for the
 * recent slice a chart actually draws.
 */

const CANDLE_COUNT = 500
const CHART_RETRIES = 3
const CHART_RETRY_BASE_MS = 500

const HISTORY_RETRIES = 5
const HISTORY_RETRY_BASE_MS = 1_000
const HISTORY_PAUSE_MS = 120

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** How long a chart's answer stands in for the next click. */
const CHART_CACHE_MS = 15_000

const chartLoads = new Map<
  string,
  { at: number; load: Promise<CandleBar[]> }
>()

/**
 * Historical calls share one polite queue. Backtests may load several markets
 * together, but the public history door should still see spaced requests.
 */
let historyTail: Promise<void> = Promise.resolve()

/** How long one bar of each timeframe lasts, for working out the start time. */
const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/**
 * The slice of a candle this module reads, checked at runtime: open time and
 * the five figures, all but the time as decimal strings. Everything else the
 * exchange sends about a bar is deliberately ignored.
 */
const candlesSchema = z.array(
  z.object({
    t: z.number(),
    o: z.string(),
    h: z.string(),
    l: z.string(),
    c: z.string(),
    v: z.string(),
  })
)

export function toCandleBars(
  data: z.infer<typeof candlesSchema>
): CandleBar[] {
  const bars: CandleBar[] = []
  for (const bar of data) {
    const open = num(bar.o)
    const high = num(bar.h)
    const low = num(bar.l)
    const close = num(bar.c)
    // A bar with an unreadable price cannot be drawn; volume can fall back to
    // zero without lying about the shape of the candle.
    if (open === null || high === null || low === null || close === null) {
      continue
    }
    bars.push({
      openTime: bar.t,
      open,
      high,
      low,
      close,
      volume: num(bar.v) ?? 0,
    })
  }
  // The exchange sends oldest-first today; sorted here so the chart never
  // depends on that staying true.
  return bars.sort((a, b) => a.openTime - b.openTime)
}

/**
 * The recent price history for one market at one timeframe.
 *
 * `since` (epoch ms) asks for everything from a moment instead of the recent
 * slice — what the practice engine uses to catch up on the price it missed
 * while nobody was watching. Without it the chart's own window applies.
 */
/** How long a candle read stands in for the next. See the note below. */
const SINCE_CACHE_MS = 30_000

/** Swept past this many entries, so a long-running worker cannot leak. */
const SINCE_CACHE_MAX = 2_000

const sinceLoads = new Map<
  string,
  { at: number; since: number; bars: CandleBar[] }
>()

export async function fetchHyperliquidCandles(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  since?: number
): Promise<CandleBar[]> {
  if (since !== undefined) {
    // Cached, because the engine asks again every single pass.
    //
    // **This was the biggest single spender left.** The ladder worker looks
    // once a second and asks for each ladder's candles every time — measured
    // at a hundred and twenty-two candle reads in thirty seconds, which is
    // several times the request-weight a minute the exchange allows, and it
    // starved the chart of the candles it needed to draw at all.
    //
    // Candles only change when a bar closes, and the bars here are hours long.
    // Half a minute of staleness cannot move a closed bar, and the worst it
    // can do is notice a bar closing half a minute late — on a four-hour
    // candle, nothing.
    // Keyed on the market, NOT on `since`.
    //
    // The caller works `since` out from the clock on every pass — "five
    // hundred bars before now" — so a key including it never repeated and the
    // cache never hit once. What actually matters is whether the bars already
    // in hand reach back far enough and are recent enough, which is a question
    // about the market, not about the number that was asked for.
    const key = `${network}:${marketId}:${interval}`
    const held = sinceLoads.get(key)
    if (
      held &&
      Date.now() - held.at < SINCE_CACHE_MS &&
      held.since <= since
    ) {
      return held.bars
    }

    const response = await infoClient(network).candleSnapshot({
      coin: marketId,
      interval,
      startTime: since,
    })
    const bars = toCandleBars(candlesSchema.parse(response))
    sinceLoads.set(key, { at: Date.now(), since, bars })
    // Swept rather than left to grow for the life of the process.
    if (sinceLoads.size > SINCE_CACHE_MAX) {
      const cutoff = Date.now() - SINCE_CACHE_MS
      for (const [old, entry] of sinceLoads) {
        if (entry.at < cutoff) sinceLoads.delete(old)
      }
    }
    return bars
  }

  // A short memory, not just in-flight dedupe.
  //
  // **Clicking between charts was unmetered spend.** Every look at a market
  // pulls five hundred candles (~28 request-weight), and nothing remembered
  // the answer — flicking A→B→A→B was four full pulls within seconds. Brisk
  // browsing on top of the engine's ordinary traffic tipped the minute's
  // budget, and the refusal landed on the chart's own next pull: "could not
  // load", caused by the clicking itself. Fifteen seconds changes nothing a
  // person can see — the forming bar only refreshes on a reload anyway, and
  // the live price line paints on top — but it makes revisits free.
  const key = JSON.stringify([network, marketId, interval])
  const held = chartLoads.get(key)
  if (held && Date.now() - held.at < CHART_CACHE_MS) return held.load

  const at = Date.now()
  const load = loadRecentCandles(network, marketId, interval)
  // A failure is never remembered as an answer — the next click retries
  // instead of inheriting the miss for fifteen seconds.
  load.catch(() => {
    if (chartLoads.get(key)?.at === at) chartLoads.delete(key)
  })
  chartLoads.set(key, { at, load })
  if (chartLoads.size > 300) {
    const cutoff = Date.now() - CHART_CACHE_MS
    for (const [old, entry] of chartLoads) {
      if (entry.at < cutoff) chartLoads.delete(old)
    }
  }
  return load
}

async function loadRecentCandles(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval
): Promise<CandleBar[]> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await infoClient(network).candleSnapshot({
        coin: marketId,
        interval,
        startTime: Date.now() - INTERVAL_MS[interval] * CANDLE_COUNT,
      })
      return toCandleBars(candlesSchema.parse(response))
    } catch (error) {
      if (!retryableCandleError(error) || attempt >= CHART_RETRIES) throw error
      await sleep(CHART_RETRY_BASE_MS * 2 ** attempt)
    }
  }
}

function retryableCandleError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /429|rate.?limit|timeout|timed out|econn|enet|socket|network|fetch failed|temporar/i.test(
      error.message
    )
  )
}

/**
 * One bounded page of finished history for the database-backed candle store.
 *
 * The store owns paging and saves each successful page before asking for the
 * next one. This adapter owns exchange courtesy: calls are spaced, and a rate
 * limit or temporary network failure backs off before it is tried again.
 */
export async function fetchHyperliquidCandleHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  if (!(to > from)) return []

  let release: () => void = () => {}
  const previous = historyTail
  historyTail = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous

  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await infoClient(network).candleSnapshot({
          coin: marketId,
          interval,
          startTime: from,
          endTime: to - 1,
        })
        return toCandleBars(candlesSchema.parse(response)).filter(
          (bar) => bar.openTime >= from && bar.openTime < to
        )
      } catch (error) {
        if (!retryableCandleError(error) || attempt >= HISTORY_RETRIES) {
          throw error
        }
        await sleep(HISTORY_RETRY_BASE_MS * 2 ** attempt)
      }
    }
  } finally {
    await sleep(HISTORY_PAUSE_MS)
    release()
  }
}

/** How long one bar of a timeframe lasts, in milliseconds. */
export function candleIntervalMs(interval: CandleInterval): number {
  return INTERVAL_MS[interval]
}
