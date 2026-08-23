import type {
  CandleBar,
  CandleInterval,
  MarketCatalog,
  MarketRow,
  NetworkId,
} from "@/lib/protocols/contracts"
import { marketKey } from "@/lib/protocols/contracts"
import {
  fetchBinanceCandleRange,
  isNotListedOnBinance,
} from "@/server/protocols/binance/candles"

/**
 * Binance's USDT perpetuals, in the app's own words.
 *
 * **Why Binance is a protocol and not a data source.** It began here as the
 * backtest's history: Hyperliquid serves about 5,000 candles, Binance serves
 * years, so runs read prices from one exchange and traded on another. That is
 * a real reason, but it is not a reason for Binance to live outside the
 * protocol layer — which is where it was, in `trade/backtest/`, naming its own
 * URLs a long way from the fence that exists to stop exactly that.
 *
 * So it is registered like any other exchange, with `orders` and `accounts`
 * switched OFF. Everything that reads capabilities already does the right
 * thing with that: its markets can be listed and charted and tested, and
 * nothing offers to trade them. Adding real Binance trading later is filling
 * in those two blocks and flipping two flags — no screen changes, because no
 * screen ever asks which exchange it is holding.
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
}

type Ticker = {
  symbol?: string
  lastPrice?: string
  priceChangePercent?: string
  quoteVolume?: string
}

/**
 * The app's coin name for a Binance symbol — the inverse of `binanceSymbolFor`.
 *
 * `BTCUSDT` is BTC. `1000PEPEUSDT` is this app's `kPEPE`, because both apps
 * write "a thousand of them" the same way the exchange that listed it did, and
 * a market called `1000PEPE` in one place and `kPEPE` in another is two names
 * for one thing.
 */
export function coinNameFor(symbol: string): string | null {
  if (!symbol.endsWith("USDT")) return null
  const base = symbol.slice(0, -"USDT".length)
  if (base.length === 0) return null
  return base.startsWith("1000") && base.length > 4 ? `k${base.slice(4)}` : base
}

function rowFor(
  info: ExchangeInfoSymbol,
  ticker: Ticker | undefined,
  network: NetworkId
): MarketRow | null {
  const symbol = info.symbol
  if (!symbol) return null
  const coin = coinNameFor(symbol)
  if (!coin) return null

  const price = Number(ticker?.lastPrice ?? 0)
  const changePct = Number(ticker?.priceChangePercent)
  // Binance quotes in USDT, which is what "in dollars" means everywhere here.
  const volume = Number(ticker?.quoteVolume ?? 0)

  return {
    key: marketKey({ protocol: "binance", network, marketId: coin }),
    marketId: coin,
    symbol: coin,
    quoteAsset: "USDT",
    // Binance has no sub-exchanges the way Hyperliquid does.
    subExchange: null,
    category: "crypto",
    sizeDecimals:
      typeof info.quantityPrecision === "number"
        ? info.quantityPrecision
        : null,
    // Not carried for Binance: nothing trades there, so nothing rounds an
    // order price against it. The candles-and-backtests role needs no tick.
    priceTick: null,
    minOrderValueUsd: null,
    // Deliberately null rather than a number. Leverage is a per-account
    // setting on Binance and asking for it needs a signed request, which this
    // protocol cannot make until it has accounts. A guess here would be a
    // number a screen could size a trade from.
    maxLeverage: null,
    isolatedOnly: false,
    iconUrl: null,
    price: Number.isFinite(price) ? price : 0,
    change24h: Number.isFinite(changePct) ? changePct / 100 : null,
    volume24hUsd: Number.isFinite(volume) ? volume : 0,
    // Both need their own endpoints, and nothing reads them for a market that
    // cannot be traded. Null says "not asked", which is honest; zero would say
    // "asked, and it is nothing".
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

  const [infoResponse, tickerResponse] = await Promise.all([
    fetch(`${FAPI}/exchangeInfo`),
    fetch(`${FAPI}/ticker/24hr`),
  ])
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
 * Today's price for these markets, off the day's figures already fetched.
 *
 * Reuses the cached catalogue rather than making its own call: this is the
 * cheap read a settle does often, and the list behind it changes fortnightly.
 */
export async function fetchBinancePrices(
  network: NetworkId,
  marketIds: readonly string[]
): Promise<Map<string, number>> {
  requireMainnet(network)
  const catalog = await fetchBinanceMarkets(network)
  const byId = new Map(catalog.rows.map((row) => [row.marketId, row.price]))
  const out = new Map<string, number>()
  for (const id of marketIds) {
    const price = byId.get(id)
    // A market the exchange would not price is left out rather than given a
    // made-up one — see the note on `prices` in the registry.
    if (price !== undefined && price > 0) out.set(id, price)
  }
  return out
}

/**
 * Binance's price grid, which it calls tick size.
 *
 * Not implemented from the exchange's own rules yet, and deliberately not
 * guessed: nothing places a Binance order, because Binance has no `orders`
 * capability. When trading is switched on this reads `PRICE_FILTER` from
 * `exchangeInfo` — until then the price is handed back untouched, which is the
 * only honest answer for a market that is charted and tested but never traded.
 */
export function roundBinancePx(px: number): number {
  return px
}
