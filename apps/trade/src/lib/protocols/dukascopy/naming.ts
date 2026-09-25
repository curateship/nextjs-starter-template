import type { CandleInterval, MarketCategory } from "@/lib/protocols/contracts"

/**
 * How Dukascopy names things, and how this app prints them back.
 *
 * Kept apart from `instruments.ts` because that file carries the whole
 * instrument table, and `marketSymbol` in `contracts.ts` runs in the browser
 * on every row of every list. This file is a few small tables and no data.
 *
 * A US stock is `<ticker>ususd`: Apple is `aaplususd`. Everything else a
 * venue lists under a name of its own goes through `DUKASCOPY_ALIASES`.
 */

/** The `<ticker>ususd` shape every US stock and US-listed ETF takes. */
const US_STOCK_SUFFIX = "ususd"

/**
 * The names venues use for markets that are not US stocks, and the Dukascopy
 * instrument each one is.
 *
 * Hand-written on purpose and checked by a test against the instrument list,
 * so a typo cannot ship. Left out on purpose: Hyperliquid's `xyz:JPY`, whose
 * price runs the other way round from Dukascopy's `usdjpy`, and the Korean
 * and bond-yield markets Dukascopy has no instrument for. A market that is
 * not here keeps the venue's own history, which is the honest answer.
 */
export const DUKASCOPY_ALIASES: Readonly<Record<string, string>> = {
  // A stock Dukascopy still files under its old ticker.
  META: "fbususd",
  // Metals, priced per ounce or per tonne in dollars on every venue.
  XAU: "xauusd",
  GOLD: "xauusd",
  XAG: "xagusd",
  SILVER: "xagusd",
  XPT: "xptcmdusd",
  PLATINUM: "xptcmdusd",
  XPD: "xpdcmdusd",
  PALLADIUM: "xpdcmdusd",
  XCU: "coppercmdusd",
  COPPER: "coppercmdusd",
  // Energy.
  CL: "lightcmdusd",
  WTI: "lightcmdusd",
  BZ: "brentcmdusd",
  BRENTOIL: "brentcmdusd",
  NATGAS: "gascmdusd",
  // Indices, in index points.
  SPX: "usa500idxusd",
  SP500: "usa500idxusd",
  US500: "usa500idxusd",
  NDX: "usatechidxusd",
  US100: "usatechidxusd",
  US30: "usa30idxusd",
  DJI: "usa30idxusd",
  JP225: "jpnidxjpy",
  VIX: "volidxusd",
  DXY: "dollaridxusd",
  // Currency pairs, dollars per unit of the first currency.
  EUR: "eurusd",
  EURUSD: "eurusd",
  GBP: "gbpusd",
  GBPUSD: "gbpusd",
  AUD: "audusd",
  AUDUSD: "audusd",
  NZD: "nzdusd",
  NZDUSD: "nzdusd",
  USDJPY: "usdjpy",
  USDCAD: "usdcad",
  USDCHF: "usdchf",
  USDHKD: "usdhkd",
}

/** What each aliased instrument prints as, on charts and in tables. */
const ALIAS_SYMBOLS: Readonly<Record<string, string>> = {
  fbususd: "META",
  xauusd: "XAU",
  xagusd: "XAG",
  xptcmdusd: "XPT",
  xpdcmdusd: "XPD",
  coppercmdusd: "XCU",
  lightcmdusd: "WTI",
  brentcmdusd: "BRENT",
  gascmdusd: "NATGAS",
  usa500idxusd: "US500",
  usatechidxusd: "US100",
  usa30idxusd: "US30",
  jpnidxjpy: "JP225",
  volidxusd: "VIX",
  dollaridxusd: "DXY",
  eurusd: "EURUSD",
  gbpusd: "GBPUSD",
  audusd: "AUDUSD",
  nzdusd: "NZDUSD",
  usdjpy: "USDJPY",
  usdcad: "USDCAD",
  usdchf: "USDCHF",
  usdhkd: "USDHKD",
}

/**
 * Coin tickers that happen to spell a US stock's Dukascopy id as well.
 *
 * `SUI` is the Sui coin on Lighter and `suiususd` is Sun Communities. A venue
 * that states no category, which is Lighter, would otherwise chart the coin
 * on the stock's history. Named here, and pinned by a test against the
 * instrument list so a stale entry is noticed.
 */
export const COINS_THAT_SPELL_A_US_STOCK: ReadonlySet<string> = new Set([
  "SUI",
  "W",
  "WEN",
])

/** The Dukascopy id a US stock ticker would have. Not a promise it exists. */
export function usStockInstrumentId(ticker: string): string {
  return `${ticker.toLowerCase()}${US_STOCK_SUFFIX}`
}

/** What a Dukascopy id prints as: `tslaususd` is TSLA, `xauusd` is XAU. */
export function dukascopySymbol(instrumentId: string): string {
  const aliased = ALIAS_SYMBOLS[instrumentId]
  if (aliased) return aliased
  if (instrumentId.endsWith(US_STOCK_SUFFIX)) {
    return instrumentId.slice(0, -US_STOCK_SUFFIX.length).toUpperCase()
  }
  return instrumentId.toUpperCase()
}

/**
 * What kind of market an id is, read off its shape. Never "other": every id
 * this app maps to is one of the four, and a fifth heading would only hide
 * a mapping mistake.
 */
export function dukascopyCategory(instrumentId: string): MarketCategory {
  if (instrumentId.endsWith(US_STOCK_SUFFIX)) return "stocks"
  if (instrumentId.includes("idx")) return "indices"
  if (instrumentId.includes("cmd") || /^(xau|xag)/.test(instrumentId)) {
    return "commodities"
  }
  return "forex"
}

/** Dukascopy's word for each candle size this app draws. */
const TIMEFRAMES: Record<CandleInterval, "m1" | "m5" | "m15" | "h1" | "h4" | "d1"> =
  {
    "1m": "m1",
    "5m": "m5",
    "15m": "m15",
    "1h": "h1",
    "4h": "h4",
    "1d": "d1",
  }

export function dukascopyTimeframe(interval: CandleInterval) {
  return TIMEFRAMES[interval]
}
