import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import type { CandleInterval, HistoryCandle } from "./history"
import { INTERVAL_MS } from "./history"

/**
 * Binance USDT-perp (futures) klines are the backtest data source: they keep
 * years of history and list far more coins than Hyperliquid's ~5,000-candle
 * wall. Live trading, order books, and slippage stay on Hyperliquid. Candles
 * are cached on disk so repeat runs (and always-tested coins like BTC/ETH) are
 * instant. See workspace/tasks/binance-candle-history-for-backtesting.md.
 */
const BINANCE_FAPI_KLINES = "https://fapi.binance.com/fapi/v1/klines"

/** Binance caps a klines request at 1500 rows; stay under it. */
const PAGE_LIMIT = 1000
/** Safety cap on a single fetch so a bad window can't download forever. */
const MAX_BARS_PER_FETCH = 60_000
const RATE_LIMIT_RETRIES = 6
const RATE_LIMIT_BASE_MS = 1_000
/** Small courtesy pause between pages to stay well under Binance's weight cap. */
const PAGE_PAUSE_MS = 120

const CACHE_DIR = join(process.cwd(), ".candle-cache", "binance")

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A large backtest fires hundreds of Binance kline requests. When they finish,
 * the remote closes the now-idle keep-alive sockets and Node surfaces that late
 * RST as an uncaught "read ECONNRESET" (TCP.onStreamRead) with no pending
 * request to attach it to — even though the backtest already completed. Left
 * unhandled it crashes the server / pops the Vite error overlay. Swallow ONLY
 * that benign, request-less reset; re-raise everything else so real crashes
 * still surface. Installed once, on first import of this module.
 */
const guardScope = globalThis as { __backtestEconnresetGuard?: boolean }
if (!guardScope.__backtestEconnresetGuard) {
  guardScope.__backtestEconnresetGuard = true
  process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
    if (err?.code === "ECONNRESET") {
      console.warn(`[backtest] ignored idle-socket ECONNRESET: ${err.message}`)
      return
    }
    throw err
  })
}

/**
 * Hyperliquid coin names that need an explicit Binance symbol. The default is
 * `<COIN>USDT`; the `k`-prefix (1000x) coins map to Binance's `1000<COIN>`.
 * Anything not on Binance perps maps to null and is reported as skipped.
 */
const SYMBOL_OVERRIDES: Record<string, string | null> = {
  // Hyperliquid-only tokens with no Binance perp listing.
  HYPE: null,
  PURR: null,
}

/** Maps an HL coin (e.g. `BTC`, `kPEPE`) to a Binance perp symbol, or null. */
export function hlToBinanceSymbol(coin: string): string | null {
  if (coin in SYMBOL_OVERRIDES) return SYMBOL_OVERRIDES[coin]
  // HL uses a `k` prefix for 1000x meme coins; Binance uses a `1000` prefix.
  const symbol = /^k[A-Z]/.test(coin) ? `1000${coin.slice(1)}USDT` : `${coin}USDT`
  // Binance symbols are uppercase alphanumeric. Anything else (e.g. a path
  // traversal attempt in the coin name) is not a real market — and the symbol
  // becomes a cache filename, so this also blocks writes outside the cache dir.
  return /^[A-Z0-9]+$/.test(symbol) ? symbol : null
}

type CacheFile = {
  symbol: string
  interval: CandleInterval
  /** Ascending, contiguous, de-duped by open time. */
  candles: HistoryCandle[]
}

function cachePath(symbol: string, interval: CandleInterval): string {
  return join(CACHE_DIR, `${symbol}-${interval}.json`)
}

async function readCache(
  symbol: string,
  interval: CandleInterval
): Promise<HistoryCandle[]> {
  try {
    const raw = await readFile(cachePath(symbol, interval), "utf8")
    const parsed = JSON.parse(raw) as CacheFile
    return parsed.candles ?? []
  } catch {
    // Missing or unreadable cache → treat as empty.
    return []
  }
}

async function writeCache(
  symbol: string,
  interval: CandleInterval,
  candles: HistoryCandle[]
): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true })
  const payload: CacheFile = { symbol, interval, candles }
  await writeFile(cachePath(symbol, interval), JSON.stringify(payload))
}

/** Fetches one contiguous [startMs, endMs] range from Binance, paginating. */
async function fetchBinanceRange(
  symbol: string,
  interval: CandleInterval,
  startMs: number,
  endMs: number
): Promise<HistoryCandle[]> {
  const stepMs = INTERVAL_MS[interval]
  const byTime = new Map<number, HistoryCandle>()

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
        const res = await fetch(url)
        status = res.status
        if (res.ok) {
          rows = (await res.json()) as unknown[]
          break
        }
        // Non-OK: drain the body so undici can release the keep-alive socket
        // cleanly instead of leaving a half-open connection to be reset later.
        await res.body?.cancel().catch(() => {})
      } catch (err) {
        // A dropped socket (ECONNRESET) mid-request or mid-body-read, or any
        // other transient network fault — long multi-page fetches hit these —
        // is retried like a rate limit so one flaky page can't crash the run.
        if (attempt >= RATE_LIMIT_RETRIES) {
          throw new Error(
            `Binance klines ${symbol} ${interval} network error: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        }
        await sleep(RATE_LIMIT_BASE_MS * 2 ** attempt)
        continue
      }
      // 429 (rate limit) / 418 (IP ban warning) → back off and retry.
      const retryable = status === 429 || status === 418
      if (!retryable || attempt >= RATE_LIMIT_RETRIES) {
        throw new Error(
          `Binance klines ${symbol} ${interval} failed: ${status}`
        )
      }
      await sleep(RATE_LIMIT_BASE_MS * 2 ** attempt)
    }
    if (!rows || rows.length === 0) break

    let lastOpen = cursor
    for (const row of rows) {
      // Binance kline: [openTime, o, h, l, c, v, closeTime, quoteVol, trades, ...]
      const k = row as Array<number | string>
      const t = Number(k[0])
      lastOpen = t
      byTime.set(t, {
        t,
        T: Number(k[6]),
        o: Number(k[1]),
        h: Number(k[2]),
        l: Number(k[3]),
        c: Number(k[4]),
        v: Number(k[5]),
        n: Number(k[8]),
      })
    }

    if (rows.length < PAGE_LIMIT) break
    if (byTime.size >= MAX_BARS_PER_FETCH) break
    cursor = lastOpen + stepMs
    await sleep(PAGE_PAUSE_MS)
  }

  return [...byTime.values()].sort((a, b) => a.t - b.t)
}

/**
 * Returns Binance candles for [startMs, endMs], serving from the on-disk cache
 * and downloading only the head/tail not yet cached. Kept contiguous per
 * symbol+interval so the cache stays a single sorted block.
 *
 * @throws if the coin has no Binance perp listing.
 */
export async function fetchBinanceCandleHistory(
  coin: string,
  interval: CandleInterval,
  startMs: number,
  endMs: number
): Promise<HistoryCandle[]> {
  const symbol = hlToBinanceSymbol(coin)
  if (!symbol) {
    throw new Error(`${coin} isn't listed on Binance perps — can't backtest it.`)
  }

  const cached = await readCache(symbol, interval)
  const byTime = new Map(cached.map((candle) => [candle.t, candle]))
  const haveMin = cached.length > 0 ? cached[0].t : null
  const haveMax = cached.length > 0 ? cached[cached.length - 1].t : null

  const missing: Array<[number, number]> =
    haveMin === null || haveMax === null
      ? [[startMs, endMs]]
      : [
          // Head: anything requested before the cached block.
          ...(startMs < haveMin
            ? ([[startMs, haveMin - INTERVAL_MS[interval]]] as [number, number][])
            : []),
          // Tail: anything requested after the cached block.
          ...(endMs > haveMax
            ? ([[haveMax + INTERVAL_MS[interval], endMs]] as [number, number][])
            : []),
        ]

  let fetched = false
  for (const [from, to] of missing) {
    if (from > to) continue
    const rows = await fetchBinanceRange(symbol, interval, from, to)
    for (const candle of rows) byTime.set(candle.t, candle)
    fetched = fetched || rows.length > 0
  }

  const merged = [...byTime.values()].sort((a, b) => a.t - b.t)
  if (fetched) await writeCache(symbol, interval, merged)

  return merged.filter((candle) => candle.t >= startMs && candle.t <= endMs)
}
