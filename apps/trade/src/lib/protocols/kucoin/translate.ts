import type {
  CandleBar,
  CandleInterval,
  LiveFigures,
} from "@/lib/protocols/contracts"

/**
 * Pure translation between KuCoin's words and the app's, shared by the server
 * folder and the browser stream. Nothing here talks to a network.
 *
 * **The one idea that matters: KuCoin trades in lots, the app trades in
 * coins.** An order's size on KuCoin is a whole number of contracts, and each
 * contract is worth `multiplier` of the coin — 0.001 BTC on XBTUSDTM, but ten
 * whole XRP on XRPUSDTM and a hundred DOGE on DOGEUSDTM. Everything the app
 * says is in coins, so every size crossing this boundary is converted, and
 * the conversion rounds DOWN: an order for slightly less than the app asked
 * is a smaller trade, where rounding up would spend money nobody offered.
 */

/** A KuCoin decimal — sometimes a string, sometimes a number — or null. */
export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string" || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The exchange's kline granularity for each chart timeframe, in MINUTES.
 * All six map exactly — no timeframe is approximated.
 */
export const KUCOIN_GRANULARITIES: Record<CandleInterval, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "1h": 60,
  "4h": 240,
  "1d": 1_440,
}

export function kucoinIntervalMs(interval: CandleInterval): number {
  return KUCOIN_GRANULARITIES[interval] * 60_000
}

/** What one contract is worth in coins, and the whole-lot step, per market. */
export type KucoinLotRule = {
  /** Coins per contract: 0.001 on BTC, 10 on XRP. */
  multiplier: number
  /** How many contracts an order must be a multiple of — nearly always 1. */
  lotSize: number
}

/**
 * Coins → whole contracts, rounded down to a legal lot.
 *
 * Zero is a real answer and the caller must refuse the order rather than
 * send it: on a market where one contract is a hundred DOGE, an order for
 * fifty DOGE is not a small order, it is no order at all.
 */
export function lotsOf(sz: number, rule: KucoinLotRule): number {
  if (!(rule.multiplier > 0) || !(sz > 0)) return 0
  const lotStep = rule.lotSize > 0 ? rule.lotSize : 1
  // The epsilon is the float-dust guard: 0.3 / 0.1 is 2.9999999999999996, and
  // without it an order for exactly three lots would place two.
  const contracts = Math.floor(sz / rule.multiplier + 1e-9)
  return Math.floor(contracts / lotStep + 1e-9) * lotStep
}

/** Whole contracts → coins, which is how every size leaves this folder. */
export function coinsOf(lots: number, rule: KucoinLotRule): number {
  return lots * rule.multiplier
}

/**
 * The coin-size step a market really has — one contract's worth of coin —
 * which is what the shared engine's decimal-places sizing is derived from.
 */
export function sizeStepOf(rule: KucoinLotRule): number {
  return rule.multiplier * (rule.lotSize > 0 ? rule.lotSize : 1)
}

/**
 * How often this market settles funding, in milliseconds. KuCoin states it
 * per contract (`fundingRateGranularity`) and it is eight hours on every
 * market seen so far, but it is read rather than assumed — a market that
 * settled hourly would otherwise report a rate eight times too small.
 */
export const KUCOIN_DEFAULT_FUNDING_MS = 8 * 3_600_000

/**
 * One contract row's moving figures, in the app's units. Null when the row
 * carries no readable price — never a made-up zero.
 *
 * `openInterest` is a count of CONTRACTS, so it becomes dollars the same way
 * a size does: contracts × coins-per-contract × price.
 */
export function toKucoinFigures(row: {
  markPrice?: unknown
  lastTradePrice?: unknown
  priceChgPct?: unknown
  turnoverOf24h?: unknown
  openInterest?: unknown
  fundingFeeRate?: unknown
  fundingRateGranularity?: unknown
  multiplier?: unknown
}): LiveFigures | null {
  const price = num(row.markPrice) ?? num(row.lastTradePrice)
  if (price === null || !(price > 0)) return null

  const funding = num(row.fundingFeeRate)
  const everyMs = num(row.fundingRateGranularity) ?? KUCOIN_DEFAULT_FUNDING_MS
  const openContracts = num(row.openInterest)
  const multiplier = num(row.multiplier)

  return {
    price,
    // Already a fraction on KuCoin: 0.0685 is a 6.85% day.
    change24h: num(row.priceChgPct),
    // Already in dollars — it is the quote currency's turnover.
    volume24hUsd: num(row.turnoverOf24h) ?? 0,
    fundingHourly:
      funding === null || !(everyMs > 0)
        ? null
        : funding / (everyMs / 3_600_000),
    openInterestUsd:
      openContracts !== null && multiplier !== null
        ? openContracts * multiplier * price
        : null,
  }
}

/**
 * One kline row from the REST feed as a bar:
 * `[time, open, high, low, close, volume, turnover]`, time in milliseconds.
 *
 * A row that cannot be read is null and the caller drops it — a half-read bar
 * drawn as a real one is worse than a gap.
 */
export function toKucoinBar(row: unknown): CandleBar | null {
  return readBar(row, { seconds: false, order: "ohlc" })
}

/**
 * One PUSHED candle as a bar — and it is not the same shape as the REST one,
 * which is the whole reason this function exists.
 *
 * KuCoin's socket sends `["1787184780", open, close, high, low, …]`: the time
 * in SECONDS as a string, and close before high and low. Read with the REST
 * reader it produced a bar dated 1970 whose low sat above its high, which the
 * chart drew as a spike from nowhere to the current price. Measured against
 * the live socket on 19 Aug 2026 — the two orders really are different.
 */
export function toKucoinPushedBar(row: unknown): CandleBar | null {
  return readBar(row, { seconds: true, order: "ochl" })
}

function readBar(
  row: unknown,
  shape: { seconds: boolean; order: "ohlc" | "ochl" }
): CandleBar | null {
  if (!Array.isArray(row) || row.length < 6) return null
  const openTime = num(row[0])
  const open = num(row[1])
  const [high, low, close] =
    shape.order === "ohlc"
      ? [num(row[2]), num(row[3]), num(row[4])]
      : [num(row[3]), num(row[4]), num(row[2])]
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
  return {
    openTime: shape.seconds ? openTime * 1_000 : openTime,
    open,
    high,
    low,
    close,
    volume: volume ?? 0,
  }
}
