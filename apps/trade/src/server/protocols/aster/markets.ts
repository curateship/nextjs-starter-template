import { z } from "zod"

import type {
  MarketCatalog,
  MarketCategory,
  MarketRow,
  NetworkId,
} from "@/lib/protocols/contracts"
import { marketKey, protocolLabel } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/aster/translate"
import { stepToDecimals } from "@/lib/protocols/tick"
import { asterPublic } from "@/server/protocols/aster/client"
import { fetchAsterFundingIntervals } from "@/server/protocols/aster/funding"

const filterSchema = z.object({
  filterType: z.string(),
  tickSize: z.union([z.string(), z.number()]).optional(),
  stepSize: z.union([z.string(), z.number()]).optional(),
})

const symbolSchema = z.object({
  symbol: z.string(),
  status: z.string(),
  contractType: z.string(),
  baseAsset: z.string(),
  quoteAsset: z.string(),
  marginAsset: z.string(),
  underlyingSubType: z.array(z.string()).default([]),
  filters: z.array(z.unknown()).default([]),
})

const exchangeInfoSchema = z.object({
  symbols: z.array(z.unknown()).default([]),
})

const tickerSchema = z.object({
  symbol: z.string(),
  priceChangePercent: z.union([z.string(), z.number()]).optional(),
  quoteVolume: z.union([z.string(), z.number()]).optional(),
})

const markSchema = z.object({
  symbol: z.string(),
  markPrice: z.union([z.string(), z.number()]),
  lastFundingRate: z.union([z.string(), z.number()]).optional(),
})

function parsedBySymbol<T extends { symbol: string }>(
  answer: unknown,
  schema: z.ZodType<T>
): Map<string, T> {
  const rows = Array.isArray(answer) ? answer : [answer]
  const found = new Map<string, T>()
  for (const raw of rows) {
    const parsed = schema.safeParse(raw)
    if (parsed.success) found.set(parsed.data.symbol, parsed.data)
  }
  return found
}

function marketCategory(subtypes: readonly string[]): MarketCategory {
  const words = subtypes.map((one) => one.toLowerCase())
  if (words.some((one) => one.includes("stock"))) return "stocks"
  if (words.some((one) => one.includes("index") || one.includes("indices"))) {
    return "indices"
  }
  if (words.some((one) => one.includes("commodit") || one.includes("metal"))) {
    return "commodities"
  }
  if (words.some((one) => one.includes("forex") || one.includes("currency"))) {
    return "forex"
  }
  return "crypto"
}

function filterValue(
  filters: readonly unknown[],
  kind: string,
  field: "tickSize" | "stepSize"
): number | null {
  for (const raw of filters) {
    const parsed = filterSchema.safeParse(raw)
    if (!parsed.success || parsed.data.filterType !== kind) continue
    return num(parsed.data[field])
  }
  return null
}

/** Saved Aster responses translated without touching the network. */
export function toAsterMarketCatalog(input: {
  network: NetworkId
  exchangeInfo: unknown
  tickers: unknown
  marks: unknown
  fundingIntervals: ReadonlyMap<string, number>
}): MarketCatalog {
  const exchangeInfo = exchangeInfoSchema.parse(input.exchangeInfo)
  const tickers = parsedBySymbol(input.tickers, tickerSchema)
  const marks = parsedBySymbol(input.marks, markSchema)
  const rows: MarketRow[] = []

  for (const raw of exchangeInfo.symbols) {
    const parsed = symbolSchema.safeParse(raw)
    if (!parsed.success) continue
    const one = parsed.data
    if (one.status !== "TRADING" || one.contractType !== "PERPETUAL") continue
    if (one.quoteAsset !== "USDT" || one.marginAsset !== "USDT") continue

    const mark = marks.get(one.symbol)
    const price = num(mark?.markPrice)
    if (price === null || !(price > 0)) continue
    const ticker = tickers.get(one.symbol)
    const changePercent = num(ticker?.priceChangePercent)
    const funding = num(mark?.lastFundingRate)
    const fundingEvery = input.fundingIntervals.get(one.symbol)

    rows.push({
      key: marketKey({
        protocol: "aster",
        network: input.network,
        marketId: one.symbol,
      }),
      marketId: one.symbol,
      symbol: one.baseAsset,
      quoteAsset: "USDT",
      subExchange: null,
      category: marketCategory(one.underlyingSubType),
      sizeDecimals: stepToDecimals(
        filterValue(one.filters, "LOT_SIZE", "stepSize")
      ),
      priceTick: filterValue(one.filters, "PRICE_FILTER", "tickSize"),
      // V3 exchangeInfo labels both margin percentage fields "ignore". The
      // real leverage ceiling is behind a signed account endpoint, so this
      // public, keys-free task leaves it unknown instead of deriving a guess.
      maxLeverage: null,
      isolatedOnly: false,
      iconUrl: null,
      price,
      change24h: changePercent === null ? null : changePercent / 100,
      volume24hUsd: num(ticker?.quoteVolume) ?? 0,
      fundingHourly:
        funding === null || fundingEvery === undefined || !(fundingEvery > 0)
          ? null
          : funding / (fundingEvery / 3_600_000),
      openInterestUsd: null,
    })
  }

  return {
    protocol: "aster",
    protocolLabel: protocolLabel("aster"),
    network: input.network,
    networkLabel: input.network === "mainnet" ? "Mainnet" : "Testnet",
    rows,
  }
}

/** Aster's active USDT-margined perpetual catalogue and current figures. */
export async function fetchAsterMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  const [exchangeInfo, tickers, marks, fundingIntervals] = await Promise.all([
    asterPublic(network, "/fapi/v3/exchangeInfo", 1),
    asterPublic(network, "/fapi/v3/ticker/24hr", 40),
    asterPublic(network, "/fapi/v3/premiumIndex", 10),
    fetchAsterFundingIntervals(network),
  ])
  return toAsterMarketCatalog({
    network,
    exchangeInfo,
    tickers,
    marks,
    fundingIntervals,
  })
}

const PRICES_HELD_MS = 2_000
type PriceCache = {
  at: number
  load: Promise<Map<string, number>>
}
const priceCaches = new Map<NetworkId, PriceCache>()

async function allMarkPrices(network: NetworkId): Promise<Map<string, number>> {
  const cached = priceCaches.get(network)
  if (cached && Date.now() - cached.at < PRICES_HELD_MS) return cached.load
  const load = asterPublic(network, "/fapi/v3/premiumIndex", 10).then(
    (answer) => {
      const marks = parsedBySymbol(answer, markSchema)
      const prices = new Map<string, number>()
      for (const [symbol, row] of marks) {
        const price = num(row.markPrice)
        if (price !== null && price > 0) prices.set(symbol, price)
      }
      return prices
    }
  )
  priceCaches.set(network, { at: Date.now(), load })
  load.catch(() => {
    if (priceCaches.get(network)?.load === load) priceCaches.delete(network)
  })
  return load
}

/** Mark prices for only the markets requested by the practice engine. */
export async function fetchAsterPrices(
  network: NetworkId,
  marketIds: readonly string[]
): Promise<Map<string, number>> {
  const prices = await allMarkPrices(network)
  const answer = new Map<string, number>()
  for (const marketId of marketIds) {
    const price = prices.get(marketId)
    if (price !== undefined) answer.set(marketId, price)
  }
  return answer
}
