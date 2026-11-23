import { z } from "zod"

import type {
  LiveFigures,
  MarketCatalog,
  MarketRow,
  NetworkId,
} from "@/lib/protocols/contracts"
import { marketKey, protocolLabel } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/apex/translate"
import { stepToDecimals } from "@/lib/protocols/tick"
import { inBatches } from "@/server/protocols/full-history"
import {
  apexContract,
  loadApexContracts,
  type ApexContract,
} from "@/server/protocols/apex/catalogue"
import { apexPublic } from "@/server/protocols/apex/client"
import {
  apexLiveFigures,
  apexLivePricesFresh,
  readApexLivePrices,
} from "@/server/protocols/apex/live-prices"

/**
 * How long the market list waits for the price feed's first frame before
 * asking ApeX one market at a time instead. The first frame arrived in 1.0
 * seconds on 24 Sep 2026.
 */
const FEED_WAIT_MS = 3_000

const tickerSchema = z.object({
  symbol: z.string(),
  markPrice: z.union([z.string(), z.number()]).optional(),
  lastPrice: z.union([z.string(), z.number()]).optional(),
  price24hPcnt: z.union([z.string(), z.number()]).optional(),
  turnover24h: z.union([z.string(), z.number()]).optional(),
  fundingRate: z.union([z.string(), z.number()]).optional(),
  openInterest: z.union([z.string(), z.number()]).optional(),
})

/**
 * One `/ticker` answer as the same figures the socket pushes.
 *
 * `price24hPcnt` is a fraction (BTC's 0.0017 was a 0.17% day), and
 * `fundingRate` is already hourly: ApeX settles funding every hour, and its
 * funding history rows sat exactly one hour apart on 24 Sep 2026.
 */
export function toApexTickerFigures(answer: unknown): LiveFigures | null {
  const rows = Array.isArray(answer) ? answer : []
  const parsed = tickerSchema.safeParse(rows[0])
  if (!parsed.success) return null
  const one = parsed.data
  const price = num(one.markPrice) ?? num(one.lastPrice)
  if (price === null || !(price > 0)) return null
  const openInterestCoins = num(one.openInterest)
  return {
    price,
    change24h: num(one.price24hPcnt),
    volume24hUsd: num(one.turnover24h) ?? 0,
    fundingHourly: num(one.fundingRate),
    openInterestUsd:
      openInterestCoins === null ? null : openInterestCoins * price,
  }
}

/** One contract and its figures as the row every screen draws. */
function toApexMarketRow(
  network: NetworkId,
  contract: ApexContract,
  figures: LiveFigures
): MarketRow {
  return {
    key: marketKey({ protocol: "apex", network, marketId: contract.marketId }),
    marketId: contract.marketId,
    symbol: contract.base,
    // Every ApeX Omni perpetual settles in USDT, 88 of 88 on 24 Sep 2026.
    quoteAsset: "USDT",
    subExchange: null,
    category: contract.category,
    sizeDecimals: stepToDecimals(contract.stepSize),
    minOrderSize: contract.minOrderSize,
    priceTick: contract.tickSize,
    minOrderValueUsd: null,
    maxLeverage: Math.round((1 / contract.initialMarginRate) * 100) / 100,
    isolatedOnly: false,
    iconUrl: contract.iconUrl,
    ...figures,
  }
}

/**
 * The figures for every contract: the price feed's when it is fresh, one
 * `/ticker` read per market when it is not.
 *
 * The feed is one connection and no requests; the tickers are 127 of the
 * 600 requests ApeX allows a minute, so they are the fallback, asked six at
 * a time at the lowest priority.
 */
async function figuresFor(
  network: NetworkId,
  contracts: readonly ApexContract[]
): Promise<Map<string, LiveFigures>> {
  const pushed = await apexLiveFigures(network, FEED_WAIT_MS)
  const figures = new Map<string, LiveFigures>()
  const missing: ApexContract[] = []
  for (const contract of contracts) {
    const found = pushed?.get(contract.marketId)
    if (found) figures.set(contract.marketId, found)
    else missing.push(contract)
  }
  const read = await inBatches(
    missing.map((contract) => async () => {
      const answer = await apexPublic(network, "/ticker", {
        symbol: contract.marketId,
      }).catch(() => null)
      return [contract.marketId, toApexTickerFigures(answer)] as const
    })
  )
  for (const [marketId, one] of read) {
    if (one) figures.set(marketId, one)
  }
  return figures
}

/** ApeX Omni's tradable perpetual and stock contracts with their figures. */
export async function fetchApexMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  const contracts = await loadApexContracts(network)
  const figures = await figuresFor(network, contracts)
  return toApexMarketCatalog(network, contracts, figures)
}

/** Saved answers translated without touching the network. */
export function toApexMarketCatalog(
  network: NetworkId,
  contracts: readonly ApexContract[],
  figures: ReadonlyMap<string, LiveFigures>
): MarketCatalog {
  const rows: MarketRow[] = []
  for (const contract of contracts) {
    const one = figures.get(contract.marketId)
    // A market with no price cannot be drawn or traded, so it waits for
    // the next read rather than showing a zero.
    if (one) rows.push(toApexMarketRow(network, contract, one))
  }
  return {
    protocol: "apex",
    protocolLabel: protocolLabel("apex"),
    network,
    networkLabel: "Mainnet",
    picker: {
      categories: "catalog",
      hip3: false,
      funding: true,
      openInterest: true,
    },
    rows,
  }
}

/**
 * Mark prices for only these markets: the price feed's when fresh, one
 * `/ticker` each when not.
 */
export async function fetchApexPrices(
  network: NetworkId,
  marketIds: readonly string[],
  options: { forOrder?: boolean } = {}
): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  const pushed = apexLivePricesFresh(network)
    ? readApexLivePrices(network).prices
    : null
  const missing: string[] = []
  for (const marketId of marketIds) {
    const price = pushed?.get(marketId)
    if (price !== undefined) prices.set(marketId, price)
    else missing.push(marketId)
  }
  const priority = options.forOrder ? "order" : "background"
  const read = await inBatches(
    missing.map((marketId) => async () => {
      await apexContract(network, marketId, priority)
      const answer = await apexPublic(
        network,
        "/ticker",
        { symbol: marketId },
        priority
      )
      return [marketId, toApexTickerFigures(answer)?.price ?? null] as const
    })
  )
  for (const [marketId, price] of read) {
    if (price !== null) prices.set(marketId, price)
  }
  return prices
}

/** ApeX prices are pushed or read fresh; nothing is served stale. */
export function apexPricesWereRationed(): boolean {
  return false
}
