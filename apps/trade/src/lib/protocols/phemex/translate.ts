import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
} from "@/lib/protocols/contracts"

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
  // The high-rate-limit host; the plain one serves the website first.
  return "wss://vapi.phemex.com/ws"
}

/** A Phemex decimal — a string most of the time — as a number, or null. */
export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string" || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
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

/**
 * The nearest price Phemex would accept: snapped to the market's own tick.
 *
 * This is the whole rounding rule — Phemex states a tick per market and
 * nothing else, so there is no five-significant-figures logic here (that is
 * Hyperliquid's rule, in Hyperliquid's folder). A market whose tick was not
 * carried (an old plan row) falls back to leaving the price alone, which the
 * exchange will refuse out loud rather than fill somewhere surprising.
 */
export function roundPhemexPx(
  px: number,
  _sizeDecimals: number | null,
  priceTick: number | null
): number {
  if (priceTick === null || !(priceTick > 0)) return px
  const ticks = Math.round(px / priceTick)
  // Ticks are decimal (0.5, 0.001), so the multiply reintroduces float dust —
  // 8583 * 0.5 = 4291.500000000001. Re-rounding to the tick's own precision
  // is exact for every tick the exchange actually uses.
  const decimals = tickDecimals(priceTick)
  return Number((ticks * priceTick).toFixed(decimals))
}

/** How many decimal places a tick like 0.001 carries. Capped for safety. */
function tickDecimals(tick: number): number {
  const text = tick.toString()
  const dot = text.indexOf(".")
  if (dot < 0) return 0
  return Math.min(text.length - dot - 1, 12)
}

/**
 * A size step as "how many decimal places a size may have" — the coarse form
 * the shared engine sizes with. Exact for the usual 10^-n steps; a step that
 * is not one (0.5, 10) reports 0 and the order path enforces the real step.
 */
export function stepToDecimals(step: number | null): number | null {
  if (step === null || !(step > 0)) return null
  const decimals = Math.round(-Math.log10(step))
  const exact = Number((10 ** -decimals).toFixed(12)) === step
  if (!exact) return 0
  return Math.max(0, decimals)
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
      funding === null ? null : funding / (PHEMEX_FUNDING_INTERVAL_MS / 3_600_000),
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
