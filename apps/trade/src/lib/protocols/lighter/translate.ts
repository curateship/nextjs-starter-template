import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
  NetworkId,
} from "@/lib/protocols/contracts"
import { snapToTick } from "@/lib/protocols/tick"

/**
 * Lighter's resolution names. All six app timeframes exist; Lighter also
 * serves 30m and 12h, which the app does not ask for.
 */
export const LIGHTER_INTERVALS: Record<CandleInterval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
}

const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000]

/**
 * Mainnet only, like the REST side. Lighter's testnet is deliberately not
 * carried; `client.ts` explains why.
 */
export function lighterWsUrl(network: NetworkId): string {
  if (network !== "mainnet") throw new Error("LIGHTER_NETWORK_UNSUPPORTED")
  return "wss://mainnet.zklighter.elliot.ai/stream"
}

export function lighterReconnectDelay(attempt: number): number {
  return RECONNECT_BACKOFF_MS[
    Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)
  ]
}

/**
 * Lighter closes a socket that stays silent for two minutes, counting only
 * frames the CLIENT sends. Pushed data does not keep the line alive, so both
 * sides of the app ping on this clock — well inside the limit, and each ping
 * still spends one of the 200 client messages a socket may send in a minute.
 */
export const LIGHTER_KEEPALIVE_MS = 50_000

const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

export function lighterIntervalMs(interval: CandleInterval): number {
  return INTERVAL_MS[interval]
}

/** A Lighter decimal — string or number — as a finite number, or null. */
export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string" || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Lighter states no tick directly; it states how many decimal places a price
 * may have. One decimal place means a $0.1 step, six mean $0.000001.
 */
export function lighterTickFromDecimals(priceDecimals: unknown): number | null {
  const decimals = num(priceDecimals)
  if (decimals === null || decimals < 0 || !Number.isInteger(decimals)) {
    return null
  }
  return Number((10 ** -decimals).toFixed(Math.min(decimals, 12)))
}

/** The nearest price Lighter's stated decimal places allow. */
export function roundLighterPx(
  px: number,
  _sizeDecimals: number | null,
  priceTick: number | null
): number {
  return snapToTick(px, priceTick)
}

/**
 * One candle row as the chart's shape. Lighter sends objects:
 * `{t, o, h, l, c, v, V}` — `t` in epoch milliseconds, `v` the coin volume
 * and `V` the dollar volume. The chart keeps the coin volume like every
 * other venue here.
 */
export function toLighterBar(row: unknown): CandleBar | null {
  if (row === null || typeof row !== "object") return null
  const bar = row as Record<string, unknown>
  const openTime = num(bar.t)
  const open = num(bar.o)
  const high = num(bar.h)
  const low = num(bar.l)
  const close = num(bar.c)
  if (
    openTime === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null
  ) {
    return null
  }
  return { openTime, open, high, low, close, volume: num(bar.v) ?? 0 }
}

/**
 * One market's row from the `market_stats` socket channel, translated.
 *
 * Two of Lighter's units differ from its own REST catalogue and are handled
 * here so no caller has to know: `daily_price_change` is a percent, and the
 * socket's `open_interest` is already in dollars where the REST catalogue's
 * is in coins. `current_funding_rate` is the percent charged per hour —
 * measured hourly on 26 Aug 2026 — so a fraction is that over one hundred.
 */
export function toLighterStatsFigures(row: unknown): {
  symbol: string
  marketId: number
  figures: LiveFigures
} | null {
  if (row === null || typeof row !== "object") return null
  const stats = row as Record<string, unknown>
  if (typeof stats.symbol !== "string" || stats.symbol === "") return null
  const marketId = num(stats.market_id)
  const price = num(stats.mark_price)
  if (marketId === null || price === null || !(price > 0)) return null
  const changePercent = num(stats.daily_price_change)
  const fundingPercent = num(stats.current_funding_rate)
  return {
    symbol: stats.symbol,
    marketId,
    figures: {
      price,
      change24h: changePercent === null ? null : changePercent / 100,
      volume24hUsd: num(stats.daily_quote_token_volume) ?? 0,
      fundingHourly: fundingPercent === null ? null : fundingPercent / 100,
      openInterestUsd: num(stats.open_interest),
    },
  }
}
