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
export async function fetchHyperliquidCandles(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  since?: number
): Promise<CandleBar[]> {
  const response = await infoClient(network).candleSnapshot({
    coin: marketId,
    interval,
    startTime: since ?? Date.now() - INTERVAL_MS[interval] * CANDLE_COUNT,
  })
  return toCandleBars(candlesSchema.parse(response))
}

/** How long one bar of a timeframe lasts, in milliseconds. */
export function candleIntervalMs(interval: CandleInterval): number {
  return INTERVAL_MS[interval]
}
