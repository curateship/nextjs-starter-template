import type {
  LiveFigures,
  MarketCatalog,
  MarketRow,
  NetworkId,
} from "@/lib/protocols/contracts"
import { marketKey, protocolLabel } from "@/lib/protocols/contracts"
import { toEdgexFigures } from "@/lib/protocols/edgex/translate"
import { stepToDecimals } from "@/lib/protocols/tick"
import { inBatches } from "@/server/protocols/full-history"
import {
  edgexContract,
  loadEdgexCatalogue,
  type EdgexContract,
} from "@/server/protocols/edgex/catalogue"
import { edgexPublic } from "@/server/protocols/edgex/client"
import {
  edgexLiveFigures,
  edgexLivePricesFresh,
  readEdgexLivePrices,
} from "@/server/protocols/edgex/live-prices"

/**
 * How long the market list waits for the price feed's first frame. The
 * first frame arrived in 1.1 seconds on 24 Sep 2026.
 */
const FEED_WAIT_MS = 3_000

/** One contract and its figures as the row every screen draws. */
function toEdgexMarketRow(
  network: NetworkId,
  contract: EdgexContract,
  figures: LiveFigures
): MarketRow {
  return {
    key: marketKey({ protocol: "edgex", network, marketId: contract.marketId }),
    marketId: contract.marketId,
    symbol: contract.base,
    // Every edgeX contract is quoted and settled in USDC, 180 of 180 on
    // 24 Sep 2026.
    quoteAsset: "USDC",
    subExchange: null,
    category: contract.category,
    sizeDecimals: stepToDecimals(contract.stepSize),
    minOrderSize: contract.minOrderSize,
    priceTick: contract.tickSize,
    minOrderValueUsd: null,
    maxLeverage: contract.maxLeverage,
    isolatedOnly: false,
    iconUrl: contract.iconUrl,
    ...figures,
  }
}

/**
 * edgeX's listed contracts with their figures.
 *
 * **The figures come from the price feed, never one read per contract.**
 * edgeX's all-contracts price read answered an empty list on 24 Sep 2026, and
 * 180 single reads would be three minutes of the 60 requests a minute Trade
 * allows itself. So when the feed has not spoken within three seconds the
 * list is refused as busy, and the next load asks again, rather than drawn
 * from a handful of reads.
 */
export async function fetchEdgexMarkets(network: NetworkId): Promise<MarketCatalog> {
  const { contracts } = await loadEdgexCatalogue(network)
  const figures = await edgexLiveFigures(network, FEED_WAIT_MS)
  if (!figures) {
    throw new Error(
      "EXCHANGE_BUSY:edgeX — its price feed did not answer within 3 seconds, asking again on the next load"
    )
  }
  return toEdgexMarketCatalog(network, contracts, figures)
}

/** Saved answers translated without touching the network. */
export function toEdgexMarketCatalog(
  network: NetworkId,
  contracts: readonly EdgexContract[],
  figures: ReadonlyMap<string, LiveFigures>
): MarketCatalog {
  const rows: MarketRow[] = []
  for (const contract of contracts) {
    // edgeX hides three contracts from its own list; so does this one.
    if (!contract.listed) continue
    const one = figures.get(contract.marketId)
    // A market with no price cannot be drawn or traded, so it waits for the
    // next read rather than showing a zero.
    if (one) rows.push(toEdgexMarketRow(network, contract, one))
  }
  return {
    protocol: "edgex",
    protocolLabel: protocolLabel("edgex"),
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

/** One `getTicker` answer's mark, for a market the feed has not priced. */
export function toEdgexTickerPrice(answer: unknown): number | null {
  const rows = Array.isArray(answer) ? answer : []
  return toEdgexFigures(rows[0])?.figures.price ?? null
}

/**
 * Mark prices for only these markets: the price feed's when fresh, one
 * `getTicker` read each when not. A handful, not the whole list, so the
 * single reads stay affordable.
 */
export async function fetchEdgexPrices(
  network: NetworkId,
  marketIds: readonly string[],
  options: { forOrder?: boolean } = {}
): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  const pushed = edgexLivePricesFresh(network) ? readEdgexLivePrices(network).prices : null
  const missing: string[] = []
  for (const marketId of marketIds) {
    const price = pushed?.get(marketId)
    if (price !== undefined) prices.set(marketId, price)
    else missing.push(marketId)
  }
  const priority = options.forOrder ? "order" : "background"
  const read = await inBatches(
    missing.map((marketId) => async () => {
      const contract = await edgexContract(network, marketId, priority)
      const answer = await edgexPublic(
        network,
        "/api/v2/public/quote/getTicker",
        { contractId: contract.contractId },
        priority
      )
      return [marketId, toEdgexTickerPrice(answer)] as const
    })
  )
  for (const [marketId, price] of read) {
    if (price !== null) prices.set(marketId, price)
  }
  return prices
}

/** edgeX prices are pushed or read fresh; nothing is served stale. */
export function edgexPricesWereRationed(): boolean {
  return false
}
