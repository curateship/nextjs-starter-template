import type { CandleBar, CandleInterval } from "@/lib/protocols/contracts"
import { binanceSymbolFor } from "@/lib/protocols/binance/translate"

/**
 * Binance USDT-perp klines — the Binance protocol's history source.
 *
 * A Binance market uses these prices for charts and backtests. A Hyperliquid
 * market never comes through this file; its full market key routes it to the
 * Hyperliquid adapter instead.
 *
 * The old app wrote JSON files under `.candle-cache/`; this app keeps finished
 * bars in `trade_candles`. This file fetches Binance pages and the shared store
 * decides which pages are missing.
 */
const BINANCE_FAPI_KLINES = "https://fapi.binance.com/fapi/v1/klines"

/** Binance caps a klines request at 1500 rows; stay under it. */
const PAGE_LIMIT = 1000

/**
 * Runaway-loop backstop, far above any real request. NOT a truncation point:
 * hitting it throws, because a fetch that quietly stopped short would leave a
 * run testing a shorter window than it says it did.
 */
const MAX_BARS_PER_FETCH = 4_000_000

const RATE_LIMIT_RETRIES = 6
const RATE_LIMIT_BASE_MS = 1_000

/** Small courtesy pause between pages, to stay well under Binance's weight cap. */
const PAGE_PAUSE_MS = 120

/** How long one bar of each timeframe lasts. Binance names them the same way. */
const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A large backtest fires hundreds of kline requests. When they finish, the
 * remote closes the now-idle keep-alive sockets and Node surfaces that late RST
 * as an uncaught "read ECONNRESET" with no pending request to attach it to —
 * even though the run already completed. Left alone it takes the server down.
 * Swallow ONLY that benign, request-less reset; re-raise everything else so
 * real crashes still surface. Installed once, on first import.
 */
const guardScope = globalThis as { __backtestEconnresetGuard?: boolean }
if (!guardScope.__backtestEconnresetGuard) {
  guardScope.__backtestEconnresetGuard = true
  process.on("uncaughtException", (error: NodeJS.ErrnoException) => {
    if (error?.code === "ECONNRESET") {
      console.warn(`[backtest] ignored idle-socket ECONNRESET: ${error.message}`)
      return
    }
    throw error
  })
}

/**
 * One contiguous stretch of klines, paginated.
 *
 * 429 (rate limited) and 418 (IP ban warning) back off and retry, doubling each
 * time — that is the failure this whole source exists to avoid, so it is the
 * one it handles most carefully. A dropped socket mid-request is retried the
 * same way: a long multi-page fetch will hit one, and a flaky page must not
 * lose the run.
 */
async function fetchRange(
  symbol: string,
  interval: CandleInterval,
  startMs: number,
  endMs: number
): Promise<CandleBar[]> {
  const stepMs = INTERVAL_MS[interval]
  const byTime = new Map<number, CandleBar>()

  let cursor = startMs
  while (cursor <= endMs) {
    const url = new URL(BINANCE_FAPI_KLINES)
    url.searchParams.set("symbol", symbol)
    url.searchParams.set("interval", interval)
    url.searchParams.set("startTime", String(cursor))
    url.searchParams.set("endTime", String(endMs))
    url.searchParams.set("limit", String(PAGE_LIMIT))

    let rows: unknown[] | undefined
    for (let attempt = 0; ; attempt += 1) {
      let status = 0
      try {
        const response = await fetch(url)
        status = response.status
        if (response.ok) {
          rows = (await response.json()) as unknown[]
          break
        }
        // Non-OK: drain the body so the socket is released cleanly instead of
        // being left half-open to be reset later.
        await response.body?.cancel().catch(() => {})
      } catch (error) {
        if (attempt >= RATE_LIMIT_RETRIES) {
          throw new Error(
            `Binance klines ${symbol} ${interval} network error: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }
        await sleep(RATE_LIMIT_BASE_MS * 2 ** attempt)
        continue
      }

      // 400 is Binance saying it does not have that symbol. That is an answer
      // about the coin, not a failure of the request — retrying cannot change
      // it, and letting it out as a plain error killed whole runs: one coin
      // that Binance had never listed took fifty-eight others down with it.
      if (status === 400) throw new Error(`BINANCE_NOT_LISTED:${symbol}`)

      const retryable = status === 429 || status === 418
      if (!retryable || attempt >= RATE_LIMIT_RETRIES) {
        throw new Error(`Binance klines ${symbol} ${interval} failed: ${status}`)
      }
      await sleep(RATE_LIMIT_BASE_MS * 2 ** attempt)
    }
    if (!rows || rows.length === 0) break

    let lastOpen = cursor
    for (const row of rows) {
      // Binance kline: [openTime, o, h, l, c, v, closeTime, quoteVol, trades…]
      const kline = row as Array<number | string>
      const openTime = Number(kline[0])
      lastOpen = openTime
      byTime.set(openTime, {
        openTime,
        open: Number(kline[1]),
        high: Number(kline[2]),
        low: Number(kline[3]),
        close: Number(kline[4]),
        volume: Number(kline[5]),
      })
    }

    if (rows.length < PAGE_LIMIT) break
    if (byTime.size >= MAX_BARS_PER_FETCH) {
      throw new Error(
        `Binance klines ${symbol} ${interval}: passed ${MAX_BARS_PER_FETCH} bars — refusing to silently truncate history.`
      )
    }
    // A page that fails to advance the cursor would loop forever.
    if (lastOpen + stepMs <= cursor) break
    cursor = lastOpen + stepMs
    await sleep(PAGE_PAUSE_MS)
  }

  return [...byTime.values()].sort((left, right) => left.openTime - right.openTime)
}

/** Whether a failure means "Binance does not list this", rather than a fault. */
export function isNotListedOnBinance(error: unknown): boolean {
  return (
    error instanceof Error && error.message.startsWith("BINANCE_NOT_LISTED")
  )
}

/**
 * Backtest candles for one coin over `[from, to)`, from Binance.
 *
 * Throws `BINANCE_NOT_LISTED:…` when Binance has no such perp — the caller
 * turns that into a skipped coin with the reason on it, never a silent absence
 * and never a failed run. Every other failure is a real fault and is passed on,
 * so a rate limit or a dropped socket is retried rather than mistaken for a
 * coin that does not exist.
 */
export async function fetchBinanceCandleRange(
  coin: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  const symbol = binanceSymbolFor(coin)
  if (!symbol) {
    throw new Error(`BINANCE_NOT_LISTED:${coin}`)
  }
  if (!(to > from)) return []

  const bars = await fetchRange(symbol, interval, from, to - 1)
  // `to` is exclusive here, the way the rest of this app's windows are.
  return bars.filter((bar) => bar.openTime >= from && bar.openTime < to)
}
