import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
} from "@/lib/protocols/contracts"
import { snapToTick } from "@/lib/protocols/tick"

/** Aster uses Binance-style interval names, and all six app intervals exist. */
export const ASTER_INTERVALS: Record<CandleInterval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
}

const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

export function asterIntervalMs(interval: CandleInterval): number {
  return INTERVAL_MS[interval]
}

/** An Aster decimal as a finite number, or null when it cannot be trusted. */
export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string" || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** The nearest price allowed by the market's PRICE_FILTER. */
export function roundAsterPx(
  px: number,
  _sizeDecimals: number | null,
  priceTick: number | null
): number {
  return snapToTick(px, priceTick)
}

/**
 * One REST kline row as the chart's candle shape.
 * Aster sends `[openTime, open, high, low, close, volume, …]`.
 */
export function toAsterBar(row: unknown): CandleBar | null {
  if (!Array.isArray(row) || row.length < 6) return null
  const openTime = num(row[0])
  const open = num(row[1])
  const high = num(row[2])
  const low = num(row[3])
  const close = num(row[4])
  const volume = num(row[5])
  if (
    openTime === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null
  ) {
    return null
  }
  return { openTime, open, high, low, close, volume: volume ?? 0 }
}

/**
 * One all-market ticker push as the list's moving figures.
 *
 * The stream contains the last traded price, not the mark price. The public
 * catalogue uses the mark price. Task 05 owns joining the separate mark-price
 * stream before this translator is registered as the live source.
 */
export function toAsterPushedFigures(row: {
  c?: unknown
  P?: unknown
  q?: unknown
}): LiveFigures | null {
  const price = num(row.c)
  if (price === null || !(price > 0)) return null
  const changePercent = num(row.P)
  return {
    price,
    change24h: changePercent === null ? null : changePercent / 100,
    volume24hUsd: num(row.q) ?? 0,
    fundingHourly: null,
    openInterestUsd: null,
  }
}
