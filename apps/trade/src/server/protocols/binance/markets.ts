import type {
  CandleBar,
  CandleInterval,
  MarketCatalog,
  MarketRow,
  NetworkId,
} from "@/lib/protocols/contracts"
import { marketKey } from "@/lib/protocols/contracts"
import { binanceSymbolFor, coinNameFor } from "@/lib/protocols/binance/translate"
import {
  fetchBinanceCandleRange,
  isNotListedOnBinance,
} from "@/server/protocols/binance/candles"
import { num } from "@/lib/protocols/number"
import { stepToDecimals } from "@/lib/protocols/tick"
import { binancePublic } from "@/server/protocols/binance/client"
import {
  READ_TIMEOUT_MS,
  requestSignal,
} from "@/server/protocols/request-timeout"

/**
 * Binance's USDT perpetuals, in the app's own words.
 *
 * **Why Binance is a protocol and not a data source.** It began here as the
 * backtest's history: Hyperliquid serves about 5,000 candles, Binance serves
 * years, so runs read prices from one exchange and traded on another. It is
 * registered like any other exchange, so its markets can be listed, charted,
 * tested and, since 24 Sep 2026, traded (`binance.md`).
 *
 * **A market's id is the app's coin name**, not Binance's symbol: `BTC` for
 * `BTCUSDT`, `kPEPE` for `1000PEPEUSDT`. Saved backtests and stored candles
 * were keyed that way before trading existed, so the order path converts
 * with `binanceSymbolFor` and `coinNameFor` rather than the keys changing.
 *
 * Mainnet only. Binance runs a testnet, but it is not the one this app's
 * practice wallets pretend against, and offering it would be offering made-up
 * prices under a real exchange's name.
 */

const FAPI = "https://fapi.binance.com/fapi/v1"

function requireMainnet(network: NetworkId): void {
  if (network !== "mainnet") throw new Error("BINANCE_NETWORK_UNSUPPORTED")
}

/**
 * How long a fetched list is kept.
 *
 * Binance lists a new perp every week or two, never every minute, and this is
 * read every time somebody opens the markets step. Ten minutes keeps the panel
 * instant without ever being meaningfully out of date.
 */
const CACHE_MS = 10 * 60 * 1000

type Cached = { at: number; catalog: MarketCatalog }

// One cache for the process rather than one per request, for the reason above.
const scope = globalThis as { __binanceMarketCache?: Cached }

type ExchangeInfoSymbol = {
  symbol?: string
  status?: string
  contractType?: string
  quoteAsset?: string
  baseAsset?: string
  quantityPrecision?: number
  filters?: Array<Record<string, unknown>>
}

type Ticker = {
  symbol?: string
  lastPrice?: string
  priceChangePercent?: string
  quoteVolume?: string
}

/** One of a market's trading rules, read from its `filters` list. */
function filterValue(
  info: ExchangeInfoSymbol,
  kind: string,
  field: string
): number | null {
  const filter = info.filters?.find((one) => one.filterType === kind)
  return filter ? num(filter[field]) : null
}

function rowFor(
  info: ExchangeInfoSymbol,
  ticker: Ticker | undefined,
  network: NetworkId
): MarketRow | null {
  const symbol = info.symbol
  if (!symbol) return null
  const coin = coinNameFor(symbol)
  // A market whose name does not turn back into the same symbol cannot be
  // charted or traded. Binance lists a few coins under Chinese names, which
  // no URL or order here spells.
  if (!coin || binanceSymbolFor(coin) !== symbol) return null

  const price = Number(ticker?.lastPrice ?? 0)
  const changePct = Number(ticker?.priceChangePercent)
  // Binance quotes in USDT, which is what "in dollars" means everywhere here.
  const volume = Number(ticker?.quoteVolume ?? 0)
  const step = filterValue(info, "LOT_SIZE", "stepSize")

  return {
    key: marketKey({ protocol: "binance", network, marketId: coin }),
    marketId: coin,
    symbol: coin,
    quoteAsset: "USDT",
    // Binance has no sub-exchanges the way Hyperliquid does.
    subExchange: null,
    category: "crypto",
    sizeDecimals:
      stepToDecimals(step) ??
      (typeof info.quantityPrecision === "number"
        ? info.quantityPrecision
        : null),
    minOrderSize: filterValue(info, "LOT_SIZE", "minQty"),
    priceTick: filterValue(info, "PRICE_FILTER", "tickSize"),
    // The band a limit price must sit inside around the mark: BTC's was
    // 0.95 to 1.05 on 24 Sep 2026. An immediate order's cap stays inside it.
    priceMultiplierUp: filterValue(info, "PERCENT_PRICE", "multiplierUp"),
    priceMultiplierDown: filterValue(info, "PERCENT_PRICE", "multiplierDown"),
    // $50 on BTC, $20 on ETH and $5 on most coins, read 24 Sep 2026.
    minOrderValueUsd: filterValue(info, "MIN_NOTIONAL", "notional"),
    // Deliberately null here. Leverage is a per-account figure on Binance and
    // needs a signed read, which `account.leverageCeilings` makes once a
    // wallet is connected. A guess here would be a number a screen could
    // size a trade from.
    maxLeverage: null,
    isolatedOnly: false,
    iconUrl: null,
    price: Number.isFinite(price) ? price : 0,
    change24h: Number.isFinite(changePct) ? changePct / 100 : null,
    volume24hUsd: Number.isFinite(volume) ? volume : 0,
    // Both need their own endpoints, and nothing reads them yet. Null says
    // "not asked", which is honest; zero would say "asked, and it is
    // nothing".
    fundingHourly: null,
    openInterestUsd: null,
  }
}

/**
 * Every USDT perpetual Binance is currently trading, with its day's figures.
 *
 * Two calls, made together: `exchangeInfo` says which markets exist and what
 * their size steps are, `ticker/24hr` says what they did today. The picker's
 * volume bands read `volume24hUsd`, so a list without the second call would
 * put every coin in the "under $1m" band — worse than no bands at all.
 *
 * Anything not `TRADING` is left out on purpose: a delisted or halted market
 * still appears in the list but its history stops dead, which would put a coin
 * in the picker that quietly tests a shorter window than it says.
 */
export async function fetchBinanceMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  requireMainnet(network)
  const cached = scope.__binanceMarketCache
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.catalog

  // Both calls give up after the read limit. Measured 15 Sep 2026: a list
  // request with no limit left a 314-coin backtest at "Loading market
  // history" for ten minutes, because every Aster stock coin checks this
  // list before it loads anything.
  let responses: [Response, Response]
  try {
    responses = await Promise.all([
      fetch(`${FAPI}/exchangeInfo`, { signal: requestSignal(READ_TIMEOUT_MS) }),
      fetch(`${FAPI}/ticker/24hr`, { signal: requestSignal(READ_TIMEOUT_MS) }),
    ])
  } catch (error) {
    if (cached) return cached.catalog
    throw error
  }
  const [infoResponse, tickerResponse] = responses
  if (!infoResponse.ok) {
    // A stale list beats no list while the exchange is briefly unavailable.
    if (cached) return cached.catalog
    throw new Error(`Binance exchangeInfo failed: ${infoResponse.status}`)
  }

  const info = (await infoResponse.json()) as { symbols?: ExchangeInfoSymbol[] }
  // The day's figures are the half this can do without: a list with no volumes
  // still lets somebody pick coins, where no list at all lets them do nothing.
  const tickers: Ticker[] = tickerResponse.ok
    ? ((await tickerResponse.json()) as Ticker[])
    : []
  const bySymbol = new Map(tickers.map((one) => [one.symbol ?? "", one]))

  const rows: MarketRow[] = []
  for (const one of info.symbols ?? []) {
    if (one.status !== "TRADING") continue
    if (one.contractType !== "PERPETUAL") continue
    if (one.quoteAsset !== "USDT") continue
    const row = rowFor(one, bySymbol.get(one.symbol ?? ""), network)
    if (row) rows.push(row)
  }

  const catalog: MarketCatalog = {
    protocol: "binance",
    protocolLabel: "Binance",
    network,
    networkLabel: network === "mainnet" ? "Mainnet" : "Testnet",
    picker: {
      categories: "crypto-only",
      hip3: false,
      funding: false,
      openInterest: false,
    },
    rows,
  }
  scope.__binanceMarketCache = { at: Date.now(), catalog }
  return catalog
}

/** How long one bar of each timeframe lasts. Binance names them the same way. */
const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

export function binanceIntervalMs(interval: CandleInterval): number {
  return INTERVAL_MS[interval]
}

/**
 * The recent slice a chart draws, or a stretch from `since`.
 *
 * Both go through the same paged range fetch the backtest uses, so a chart and
 * a replay of the same market read identical bars — the alternative is two
 * ways to ask one exchange for one thing, which drift.
 */
export async function fetchBinanceCandles(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  since?: number
): Promise<CandleBar[]> {
  requireMainnet(network)
  const to = Date.now()
  const from = since ?? to - CHART_BARS * INTERVAL_MS[interval]
  return fetchBinanceCandleRange(marketId, interval, from, to)
}

/**
 * The earliest moment Binance could have a perpetual bar for anything.
 *
 * Binance Futures opened in September 2019. Asking before that costs a page
 * of nothing per coin per six months, and the candle store asks page by page
 * from wherever it is told to start.
 */
const BINANCE_FUTURES_OPENED = Date.parse("2019-09-01T00:00:00.000Z")

export function binanceHistoryFloor(): number {
  return BINANCE_FUTURES_OPENED
}

/** A finished historical window for the shared candle store. */
export async function fetchBinanceCandleHistory(
  network: NetworkId,
  marketId: string,
  interval: CandleInterval,
  from: number,
  to: number
): Promise<CandleBar[]> {
  requireMainnet(network)
  try {
    return await fetchBinanceCandleRange(marketId, interval, from, to)
  } catch (error) {
    // A saved market may be delisted after it was chosen. That is an empty
    // history answer for this one coin, not a reason to fail every other coin
    // in the run. Network and rate-limit failures still escape and retry.
    if (isNotListedOnBinance(error)) return []
    throw error
  }
}

/** Bars a chart asks for when nothing said how far back to read. */
const CHART_BARS = 1_000

/**
 * Mark prices are held this long. The engine reads the pushed feed first
 * (`live-prices.ts`) and only asks here when that feed is quiet. All markets
 * cost 10 request units at once, so five seconds keeps a quiet feed from
 * spending the minute.
 */
const MARKS_HELD_MS = 5_000

const markScope = globalThis as {
  __binanceMarks?: { at: number; load: Promise<Map<string, number>> }
}

function allMarks(forOrder: boolean): Promise<Map<string, number>> {
  const held = markScope.__binanceMarks
  if (held && Date.now() - held.at < MARKS_HELD_MS) return held.load
  const load = binancePublic(
    "mainnet",
    "/fapi/v1/premiumIndex",
    {},
    forOrder ? "order" : "background"
  ).then((answer) => {
    const marks = new Map<string, number>()
    for (const raw of Array.isArray(answer) ? answer : []) {
      const row = raw as { symbol?: unknown; markPrice?: unknown }
      const mark = num(row.markPrice)
      if (typeof row.symbol === "string" && mark !== null && mark > 0) {
        marks.set(row.symbol, mark)
      }
    }
    return marks
  })
  const entry = { at: Date.now(), load }
  markScope.__binanceMarks = entry
  load.catch(() => {
    if (markScope.__binanceMarks === entry) markScope.__binanceMarks = undefined
  })
  return load
}

/**
 * Today's mark price for these markets. The mark, not the last trade, because
 * it is the price Binance fires stops and liquidations against.
 */
export async function fetchBinancePrices(
  network: NetworkId,
  marketIds: readonly string[],
  options: { forOrder?: boolean } = {}
): Promise<Map<string, number>> {
  requireMainnet(network)
  const marks = await allMarks(options.forOrder === true)
  const out = new Map<string, number>()
  for (const id of marketIds) {
    const symbol = binanceSymbolFor(id)
    const price = symbol ? marks.get(symbol) : undefined
    // A market the exchange would not price is left out rather than given a
    // made-up one — see the note on `prices` in the registry.
    if (price !== undefined && price > 0) out.set(id, price)
  }
  return out
}

/** Binance never answers prices from a stale copy when it is rationing. */
export function binancePricesWereRationed(): boolean {
  return false
}
