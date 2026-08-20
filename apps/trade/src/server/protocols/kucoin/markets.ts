import { z } from "zod"

import type {
  MarketCatalog,
  MarketRow,
  NetworkId,
} from "@/lib/protocols/contracts"
import { marketKey, protocolLabel } from "@/lib/protocols/contracts"
import {
  KUCOIN_DEFAULT_FUNDING_MS,
  num,
  sizeStepOf,
  toKucoinFigures,
  type KucoinLotRule,
} from "@/lib/protocols/kucoin/translate"
import { snapToTick, stepToDecimals } from "@/lib/protocols/tick"
import { kucoinPublic } from "@/server/protocols/kucoin/client"

/**
 * KuCoin's market catalogue: what trades, its rules, and today's figures.
 *
 * `/api/v1/contracts/active` answers all of it in one call — every contract's
 * tick, lot maths, leverage ceiling, mark price, day's move, turnover, open
 * interest and funding rate. Only dollar-settled contracts are read; the
 * coin-settled ones (`isInverse`) settle in the coin and are a different
 * trade this app does not make.
 *
 * That one call is 1.3 MB, so it is NOT what "today's price" reads. The
 * catalogue is asked for rarely and cached; prices come from the far smaller
 * all-tickers read below.
 */

const contractSchema = z.object({
  symbol: z.string(),
  status: z.string().optional(),
  settleCurrency: z.string().optional(),
  quoteCurrency: z.string().optional(),
  baseCurrency: z.string().optional(),
  isInverse: z.boolean().optional(),
  multiplier: z.union([z.string(), z.number()]).optional(),
  lotSize: z.union([z.string(), z.number()]).optional(),
  tickSize: z.union([z.string(), z.number()]).optional(),
  maxLeverage: z.union([z.string(), z.number()]).optional(),
  markPrice: z.union([z.string(), z.number()]).optional(),
  lastTradePrice: z.union([z.string(), z.number()]).optional(),
  priceChgPct: z.union([z.string(), z.number()]).optional(),
  turnoverOf24h: z.union([z.string(), z.number()]).optional(),
  openInterest: z.union([z.string(), z.number()]).optional(),
  fundingFeeRate: z.union([z.string(), z.number()]).optional(),
  fundingRateGranularity: z.union([z.string(), z.number()]).optional(),
})

type Contract = z.infer<typeof contractSchema>

/** A dollar-settled contract anyone can trade today. */
function tradeable(one: Contract): boolean {
  if (one.status !== undefined && one.status !== "Open") return false
  if (one.isInverse === true) return false
  const settle = one.settleCurrency ?? one.quoteCurrency
  return settle === undefined || settle === "USDT"
}

// ----- The contract rulebook, cached ---------------------------------------

/**
 * How long the rulebook stands. Ticks, lot sizes and leverage ceilings change
 * when a market is listed or re-tiered, which is the exchange's timescale and
 * not ours — and the order path needs these on every single order, so asking
 * each time would spend the whole request allowance on a question whose
 * answer had not moved.
 */
const CONTRACTS_GOOD_FOR_MS = 5 * 60_000

type ContractCache = {
  at: number
  bySymbol: Map<string, Contract>
  inFlight: Promise<Map<string, Contract>> | null
}

const contractCaches = new Map<NetworkId, ContractCache>()

function contractCache(network: NetworkId): ContractCache {
  const found = contractCaches.get(network)
  if (found) return found
  const made: ContractCache = { at: 0, bySymbol: new Map(), inFlight: null }
  contractCaches.set(network, made)
  return made
}

async function contracts(network: NetworkId): Promise<Map<string, Contract>> {
  const cache = contractCache(network)
  if (Date.now() - cache.at <= CONTRACTS_GOOD_FOR_MS && cache.bySymbol.size > 0) {
    return cache.bySymbol
  }
  cache.inFlight ??= (async () => {
    const answer = await kucoinPublic(network, "/api/v1/contracts/active")
    const rows = Array.isArray(answer) ? answer : []
    const bySymbol = new Map<string, Contract>()
    for (const raw of rows) {
      const parsed = contractSchema.safeParse(raw)
      if (parsed.success && tradeable(parsed.data)) {
        bySymbol.set(parsed.data.symbol, parsed.data)
      }
    }
    cache.bySymbol = bySymbol
    cache.at = Date.now()
    return bySymbol
  })().finally(() => {
    cache.inFlight = null
  })
  return cache.inFlight
}

/**
 * One market's lot maths and price tick, for the order path. Throws the
 * app's own "this market is not listed" rather than guessing a multiplier —
 * guessing one would size an order by a factor of a hundred on some coins.
 */
export async function kucoinMarketRules(
  network: NetworkId,
  marketId: string
): Promise<{ lot: KucoinLotRule; priceTick: number | null }> {
  const one = (await contracts(network)).get(marketId)
  if (!one) throw new Error("LIVE_UNLISTED")
  const multiplier = num(one.multiplier)
  if (multiplier === null || !(multiplier > 0)) throw new Error("LIVE_UNLISTED")
  return {
    lot: { multiplier, lotSize: num(one.lotSize) ?? 1 },
    priceTick: num(one.tickSize),
  }
}

/** How often this market settles funding — read from the contract, not assumed. */
export async function kucoinFundingIntervalMs(
  marketId: string
): Promise<number> {
  const one = (await contracts("mainnet")).get(marketId)
  return num(one?.fundingRateGranularity) ?? KUCOIN_DEFAULT_FUNDING_MS
}

// ----- The catalogue --------------------------------------------------------

export async function fetchKucoinMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  const bySymbol = await contracts(network)

  const rows: MarketRow[] = []
  for (const one of bySymbol.values()) {
    const figures = toKucoinFigures(one)
    // A market the exchange would not price is left out rather than drawn at
    // $0 — the same rule as every other catalogue here.
    if (!figures) continue
    const multiplier = num(one.multiplier)
    if (multiplier === null || !(multiplier > 0)) continue

    rows.push({
      key: marketKey({ protocol: "kucoin", network, marketId: one.symbol }),
      marketId: one.symbol,
      // "XBTUSDTM" prints as the coin. KuCoin calls Bitcoin XBT in its ids
      // and BTC nowhere else, so the base currency it states is what is
      // shown — with the id itself as the fallback.
      symbol: one.baseCurrency || one.symbol.replace(/USDTM?$/, ""),
      subExchange: null,
      category: "crypto",
      sizeDecimals: stepToDecimals(
        sizeStepOf({ multiplier, lotSize: num(one.lotSize) ?? 1 })
      ),
      priceTick: num(one.tickSize),
      maxLeverage: num(one.maxLeverage),
      isolatedOnly: false,
      iconUrl: null,
      price: figures.price,
      change24h: figures.change24h,
      volume24hUsd: figures.volume24hUsd,
      fundingHourly: figures.fundingHourly,
      openInterestUsd: figures.openInterestUsd,
    })
  }

  return {
    protocol: "kucoin",
    protocolLabel: protocolLabel("kucoin"),
    network,
    // Mainnet is the only network this folder serves; the client refuses any
    // other before a request is built.
    networkLabel: "Mainnet",
    rows,
  }
}

/** The nearest price KuCoin would accept, snapped to the market's own tick. */
export function roundKucoinPx(
  px: number,
  _sizeDecimals: number | null,
  priceTick: number | null
): number {
  return snapToTick(px, priceTick)
}

// ----- Today's price, the cheap way ----------------------------------------

/** How long one all-tickers answer stands in for the next. */
const PRICES_GOOD_FOR_MS = 2_000

const tickerSchema = z.object({
  symbol: z.string(),
  price: z.union([z.string(), z.number()]).optional(),
})

type PriceCache = {
  at: number
  prices: Map<string, number>
  /** True while answers are being served stale because the exchange rationed us. */
  rationed: boolean
  inFlight: Promise<Map<string, number>> | null
}

const priceCaches = new Map<NetworkId, PriceCache>()

function priceCache(network: NetworkId): PriceCache {
  const found = priceCaches.get(network)
  if (found) return found
  const made: PriceCache = {
    at: 0,
    prices: new Map(),
    rationed: false,
    inFlight: null,
  }
  priceCaches.set(network, made)
  return made
}

/**
 * Today's price for these markets, from the all-tickers read — 150 KB rather
 * than the rulebook's 1.3 MB, shared by every caller inside a two-second
 * window.
 *
 * **This is the last traded price, where the catalogue's column is the mark
 * price.** They sit within a hair of each other on a book anyone is trading,
 * and KuCoin publishes no all-markets mark-price read at all; asking per
 * market would be one request per coin. Said out loud because it is the one
 * place this exchange answers a slightly different question from the others.
 */
export async function fetchKucoinPrices(
  network: NetworkId,
  marketIds: readonly string[]
): Promise<Map<string, number>> {
  const cache = priceCache(network)
  if (Date.now() - cache.at > PRICES_GOOD_FOR_MS) {
    cache.inFlight ??= kucoinPublic(network, "/api/v1/allTickers")
      .then((answer) => {
        const prices = new Map<string, number>()
        for (const raw of Array.isArray(answer) ? answer : []) {
          const row = tickerSchema.safeParse(raw)
          if (!row.success) continue
          const price = num(row.data.price)
          if (price !== null && price > 0) prices.set(row.data.symbol, price)
        }
        cache.prices = prices
        cache.at = Date.now()
        cache.rationed = false
        return prices
      })
      .catch((error: unknown) => {
        // Serve the stale answer while saying so, but only for a rationing —
        // any other failure means the stale answer may be WRONG, not just old.
        const message = error instanceof Error ? error.message : ""
        if (message === "EXCHANGE_BUSY") {
          cache.rationed = true
          return cache.prices
        }
        throw error
      })
      .finally(() => {
        cache.inFlight = null
      })
    await cache.inFlight
  }

  const answer = new Map<string, number>()
  for (const marketId of marketIds) {
    const price = cache.prices.get(marketId)
    if (price !== undefined) answer.set(marketId, price)
  }
  return answer
}

/** Whether the last price answer for this market was a rationed, stale one. */
export function kucoinPricesWereRationed(
  network: NetworkId,
  marketId: string
): boolean {
  const cache = priceCache(network)
  return cache.rationed && cache.prices.has(marketId)
}
