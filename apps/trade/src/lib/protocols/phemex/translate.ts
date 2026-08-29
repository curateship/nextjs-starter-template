import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
} from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/number"

export { num } from "@/lib/protocols/number"

/**
 * Pure translation between Phemex's words and the app's, shared by the
 * server folder and the browser stream. Nothing here talks to a network.
 *
 * Phemex's USDT-settled ("g-contract") API speaks in real decimal strings —
 * fields ending `Rp` (a price), `Rq` (a quantity of coin) and `Rv` (a value
 * in dollars). Only that API is spoken here; the older coin-settled API
 * reports scaled whole numbers (`Ep`/`Ev`) and is never used, because a
 * price that is secretly ten-thousand times itself is exactly the kind of
 * mistake that costs money.
 */

/**
 * Where the public websocket lives — browser and server alike. Mainnet only,
 * same as everything else Phemex here; any other network is refused loudly
 * rather than connected somewhere nothing should reach.
 */
export function phemexWsUrl(network: "mainnet" | "testnet"): string {
  if (network !== "mainnet") throw new Error("PHEMEX_NETWORK_UNSUPPORTED")
  // No path on the end, and not the `vapi` host. Both were tried against the
  // live exchange on 19 Aug 2026 and both are refused outright, from a browser
  // and from the server alike — so Phemex prices never streamed at all, and
  // every screen quietly fell back to asking again every few seconds.
  return "wss://ws.phemex.com"
}

/**
 * The exchange's resolution for each chart timeframe, in seconds. All six
 * map exactly — no timeframe is approximated.
 */
export const PHEMEX_RESOLUTIONS: Record<CandleInterval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3_600,
  "4h": 14_400,
  "1d": 86_400,
}

export function phemexIntervalMs(interval: CandleInterval): number {
  return PHEMEX_RESOLUTIONS[interval] * 1_000
}

/** The symbol Phemex files a market's 8-hour funding history under. */
export function phemexFundingSymbol(marketId: string): string {
  return `.${marketId}FR8H`
}

/** Funding settles every 8 hours on Phemex. */
export const PHEMEX_FUNDING_INTERVAL_MS = 8 * 3_600_000

/**
 * One 24-hour ticker row (`/md/v2/ticker/24hr`) as the figures screens draw.
 * Null when the row carries no readable price — never a made-up zero.
 */
export function toPhemexFigures(row: {
  markPriceRp?: unknown
  openRp?: unknown
  turnoverRv?: unknown
  fundingRateRr?: unknown
  openInterestRv?: unknown
}): LiveFigures | null {
  const price = num(row.markPriceRp)
  if (price === null || !(price > 0)) return null
  const open = num(row.openRp)
  const funding = num(row.fundingRateRr)
  return {
    price,
    change24h: open !== null && open > 0 ? (price - open) / open : null,
    volume24hUsd: num(row.turnoverRv) ?? 0,
    // Phemex states the 8-hour rate; the app speaks hourly everywhere.
    fundingHourly:
      funding === null
        ? null
        : funding / (PHEMEX_FUNDING_INTERVAL_MS / 3_600_000),
    openInterestUsd: num(row.openInterestRv),
  }
}

/**
 * One kline row as a bar. Phemex sends
 * `[timestamp, interval, lastClose, open, high, low, close, volume, turnover]`
 * with the timestamp in epoch seconds. A row that cannot be read is null and
 * the caller drops it — a half-read bar drawn as a real one is worse than a
 * gap.
 */
export function toPhemexBar(row: unknown): CandleBar | null {
  if (!Array.isArray(row) || row.length < 8) return null
  const openTime = num(row[0])
  const open = num(row[3])
  const high = num(row[4])
  const low = num(row[5])
  const close = num(row[6])
  const volume = num(row[7])
  if (
    openTime === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null
  ) {
    return null
  }
  return {
    openTime: openTime * 1_000,
    open,
    high,
    low,
    close,
    volume: volume ?? 0,
  }
}
