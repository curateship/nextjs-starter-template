import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
  NetworkId,
} from "@/lib/protocols/contracts"

/** Aster uses Binance-style interval names, and all six app intervals exist. */
export const ASTER_INTERVALS: Record<CandleInterval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
}

export function asterWsUrl(network: NetworkId): string {
  return network === "testnet"
    ? "wss://fstream5.asterdex-testnet.com/ws"
    : "wss://fstream.asterdex.com/ws"
}

/** An Aster decimal as a finite number, or null when it cannot be trusted. */
export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string" || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
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

/** One all-market ticker push, without pretending its last trade is the mark. */
export function toAsterTickerFigures(row: {
  c?: unknown
  P?: unknown
  q?: unknown
}): Pick<LiveFigures, "change24h" | "volume24hUsd"> {
  const changePercent = num(row.P)
  return {
    change24h: changePercent === null ? null : changePercent / 100,
    volume24hUsd: num(row.q) ?? 0,
  }
}

/** Aster's mark-price push joined to the latest daily trading figures. */
export function toAsterPushedFigures(
  mark: unknown,
  ticker: Pick<LiveFigures, "change24h" | "volume24hUsd"> | null
): LiveFigures | null {
  const price = num(mark)
  if (price === null || !(price > 0) || ticker === null) return null
  return {
    price,
    change24h: ticker.change24h,
    volume24hUsd: ticker.volume24hUsd,
    fundingHourly: null,
    openInterestUsd: null,
  }
}
