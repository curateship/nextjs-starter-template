import { InfoClient } from "@nktkas/hyperliquid"

import { createReadOnlyHttpTransport } from "@/server/hyperliquid/transport"

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d"

/** Numeric OHLCV candle used by the backtest engine and chart. */
export type HistoryCandle = {
  /** Open time, ms since epoch. */
  t: number
  /** Close time, ms since epoch. */
  T: number
  o: number
  h: number
  l: number
  c: number
  v: number
  /** Trade count. */
  n: number
}

export const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/** A single candleSnapshot page tops out near 5000 rows. */
const PAGE_LIMIT = 5000
const MAX_PAGES = 20
/** Hard safety cap; the API call site also validates the window up front. */
const MAX_BARS = 12_000
/**
 * Hyperliquid rate-limits bursts of candleSnapshot pages with a 429 — which a
 * multi-market backtest (one request fetching every market's candles back to
 * back) trips easily. Retry the page with exponential backoff instead of
 * failing the whole run on a later market.
 */
const RATE_LIMIT_RETRIES = 6
const RATE_LIMIT_BASE_MS = 1_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let infoClient: InfoClient | null = null

/**
 * Read-only mainnet InfoClient for backtest candle history. Candles are
 * public data, so this bypasses the mainnet trading gate (same rationale as
 * the scanner's info client).
 */
function getBacktestInfoClient(): InfoClient {
  if (!infoClient) {
    infoClient = new InfoClient({
      transport: createReadOnlyHttpTransport("mainnet"),
    })
  }
  return infoClient
}

/**
 * Fetches mainnet candles for [startMs, endMs], paginating past the per-call
 * row cap, de-duping by open time, and returning them ascending. Numeric
 * fields are converted once here.
 */
export async function fetchCandleHistory(
  coin: string,
  interval: CandleInterval,
  startMs: number,
  endMs: number
): Promise<HistoryCandle[]> {
  const info = getBacktestInfoClient()
  const stepMs = INTERVAL_MS[interval]
  const byTime = new Map<number, HistoryCandle>()

  let cursor = startMs
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // A full final page can advance the cursor past endMs (last.t + step > end);
    // requesting startTime > endTime makes Hyperliquid 500, so stop here.
    if (cursor > endMs) break
    let snapshot: Awaited<ReturnType<typeof info.candleSnapshot>> | undefined
    for (let attempt = 0; ; attempt += 1) {
      try {
        snapshot = await info.candleSnapshot({
          coin,
          interval,
          startTime: cursor,
          endTime: endMs,
        })
        break
      } catch (error) {
        const rateLimited =
          error instanceof Error && error.message.includes("429")
        if (!rateLimited || attempt >= RATE_LIMIT_RETRIES) throw error
        await sleep(RATE_LIMIT_BASE_MS * 2 ** attempt)
      }
    }
    if (!snapshot || snapshot.length === 0) break

    for (const candle of snapshot) {
      byTime.set(candle.t, {
        t: candle.t,
        T: candle.T,
        o: Number(candle.o),
        h: Number(candle.h),
        l: Number(candle.l),
        c: Number(candle.c),
        v: Number(candle.v),
        n: candle.n,
      })
    }

    const last = snapshot[snapshot.length - 1]
    if (snapshot.length < PAGE_LIMIT || last.t >= endMs) break
    if (byTime.size >= MAX_BARS) break
    cursor = last.t + stepMs
  }

  return [...byTime.values()]
    .filter((candle) => candle.t <= endMs)
    .sort((a, b) => a.t - b.t)
}
