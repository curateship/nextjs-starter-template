import { z } from "zod"

import type {
  MarketCatalog,
  MarketRow,
  NetworkId,
} from "@/lib/protocols/contracts"
import { marketKey, protocolLabel } from "@/lib/protocols/contracts"
import { num, toPhemexFigures } from "@/lib/protocols/phemex/translate"
import { stepToDecimals } from "@/lib/protocols/tick"
import { phemexPublic } from "@/server/protocols/phemex/client"

/**
 * Phemex's market catalogue: what trades, its rules, and today's figures.
 *
 * Two public reads make one catalogue. `/public/products` is the rulebook —
 * which USDT-settled perpetuals exist, each one's price tick, size step and
 * leverage ceiling. `/md/v2/ticker/24hr/all` is today's figures for all of
 * them in one call. Only `perpProductsV2` rows are read: those are the
 * dollar-settled contracts with real decimal prices; the older coin-settled
 * rows speak in scaled whole numbers and are deliberately never parsed.
 */

const productSchema = z.object({
  symbol: z.string(),
  status: z.string().optional(),
  settleCurrency: z.string().optional(),
  baseCurrency: z.string().optional(),
  tickSize: z.union([z.string(), z.number()]).optional(),
  qtyStepSize: z.union([z.string(), z.number()]).optional(),
  maxLeverage: z.union([z.string(), z.number()]).optional(),
})

const productsSchema = z.object({
  perpProductsV2: z.array(z.unknown()).default([]),
})

const tickerSchema = z.object({
  symbol: z.string(),
  markPriceRp: z.union([z.string(), z.number()]).optional(),
  openRp: z.union([z.string(), z.number()]).optional(),
  turnoverRv: z.union([z.string(), z.number()]).optional(),
  fundingRateRr: z.union([z.string(), z.number()]).optional(),
  openInterestRv: z.union([z.string(), z.number()]).optional(),
})

async function fetchTickers(
  network: NetworkId
): Promise<Map<string, z.infer<typeof tickerSchema>>> {
  const answer = await phemexPublic(network, "/md/v2/ticker/24hr/all")
  const rows = Array.isArray(answer) ? answer : []
  const bySymbol = new Map<string, z.infer<typeof tickerSchema>>()
  for (const row of rows) {
    const parsed = tickerSchema.safeParse(row)
    if (parsed.success) bySymbol.set(parsed.data.symbol, parsed.data)
  }
  return bySymbol
}

export async function fetchPhemexMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  const [products, tickers] = await Promise.all([
    phemexPublic(network, "/public/products"),
    fetchTickers(network),
  ])
  const parsed = productsSchema.parse(products)

  const rows: MarketRow[] = []
  for (const raw of parsed.perpProductsV2) {
    const product = productSchema.safeParse(raw)
    if (!product.success) continue
    const one = product.data
    // Delisted rows stay in the answer; a coin nobody can trade is not a row.
    if (one.status !== undefined && one.status !== "Listed") continue
    if (one.settleCurrency !== undefined && one.settleCurrency !== "USDT") {
      continue
    }

    const figures = toPhemexFigures(tickers.get(one.symbol) ?? {})
    // A market the ticker cannot price is left out rather than drawn at $0 —
    // same rule as every other catalogue here.
    if (!figures) continue

    rows.push({
      key: marketKey({ protocol: "phemex", network, marketId: one.symbol }),
      // The exchange's own id ("BTCUSDT") keys everything; the bare coin is
      // what gets printed, like every other list in the app.
      marketId: one.symbol,
      symbol: one.baseCurrency || one.symbol.replace(/USDT$/, ""),
      quoteAsset: "USDT",
      subExchange: null,
      category: "crypto",
      sizeDecimals: stepToDecimals(num(one.qtyStepSize)),
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
    protocol: "phemex",
    protocolLabel: protocolLabel("phemex"),
    network,
    // Mainnet is the only network this folder serves — `restBase` has
    // already refused anything else by the time a catalog is being labelled.
    networkLabel: "Mainnet",
    rows,
  }
}

// ----- Today's price, the cheap way ---------------------------------------

/** How long one all-tickers answer stands in for the next. */
const PRICES_GOOD_FOR_MS = 2_000

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
 * Today's mark price for these markets — one all-tickers read shared by
 * every caller inside a two-second window, exactly like the other exchanges'
 * price layers. A rate-limited read serves the last answer and raises the
 * `rationed` flag so refusals can say "busy" instead of "no such coin".
 */
export async function fetchPhemexPrices(
  network: NetworkId,
  marketIds: readonly string[]
): Promise<Map<string, number>> {
  const cache = priceCache(network)
  if (Date.now() - cache.at > PRICES_GOOD_FOR_MS) {
    cache.inFlight ??= fetchTickers(network)
      .then((tickers) => {
        const prices = new Map<string, number>()
        for (const [symbol, row] of tickers) {
          const price = num(row.markPriceRp)
          if (price !== null && price > 0) prices.set(symbol, price)
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
        if (
          message === "EXCHANGE_BUSY" ||
          message.startsWith("PHEMEX_HTTP_429")
        ) {
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
export function phemexPricesWereRationed(
  network: NetworkId,
  marketId: string
): boolean {
  const cache = priceCache(network)
  return cache.rationed && cache.prices.has(marketId)
}
