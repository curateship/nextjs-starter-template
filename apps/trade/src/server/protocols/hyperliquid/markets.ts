import { z } from "zod"

import {
  marketKey,
  type MarketCatalog,
  type MarketRow,
  type NetworkId,
} from "@/lib/protocols/contracts"
import {
  namespaceMarketId,
  normalizeMarketCategory,
  num,
} from "@/lib/protocols/hyperliquid/translate"
import {
  allAssetCtxsSnapshot,
  infoClient,
} from "@/server/protocols/hyperliquid/client"

/**
 * Everything this app knows about Hyperliquid lives in this folder, and this
 * folder is the only place `@nktkas/hyperliquid` may be imported —
 * `../fence.test.ts` fails the build if it leaks. Screens see `MarketRow`s;
 * the exchange's own names for things stop at this file.
 *
 * Read-only. The market list is public data — no key, no signature, no
 * account — so there is nothing here to protect beyond not trusting the
 * response blindly.
 *
 * Hyperliquid is several venues in one: the main exchange plus the
 * sub-exchanges it hosts (stocks, indices and whatever gets deployed next).
 * This module reads them all. A sub-exchange asset arrives already
 * namespaced — `"xyz:AAPL"` — which is what keeps every market id unique
 * across venues, and that namespaced id is exactly what the candle endpoint
 * expects back.
 */

/** The venue list: null is the main exchange, the rest are sub-exchanges. */
const perpDexsSchema = z.array(
  z.union([
    z.null(),
    z.object({
      name: z.string().min(1),
      fullName: z.string(),
    }),
  ])
)

type PerpDex = z.infer<typeof perpDexsSchema>[number]

/**
 * The slice of the exchange's answer this module actually reads, checked at
 * runtime. The SDK is typed, but the wire is the wire: a field that arrives
 * missing or renamed should fail here, loudly, not as NaN three screens away.
 * Everything else in the response is deliberately ignored.
 */
const metaSchema = z.object({
  universe: z.array(
    z.object({
      name: z.string().min(1),
      isDelisted: z.boolean().optional(),
      // The market's ground rules. Optional so one venue writing them
      // strangely cannot take the whole list down — a missing rule shows
      // as nothing, never as a guess.
      szDecimals: z.number().int().min(0).max(12).optional(),
      maxLeverage: z.number().positive().optional(),
      onlyIsolated: z.boolean().optional(),
    })
  ),
})

const assetCtxSchema = z.object({
  markPx: z.string(),
  prevDayPx: z.string(),
  dayNtlVlm: z.string(),
  funding: z.string(),
  openInterest: z.string(),
})

const allMetasSchema = z.array(metaSchema)
const allAssetCtxsSchema = z.array(
  z.tuple([z.string(), z.array(assetCtxSchema)])
)
type MetaAndCtxs = [
  z.infer<typeof metaSchema>,
  z.infer<typeof assetCtxSchema>[],
]

export function toMarketRows(
  data: MetaAndCtxs,
  network: NetworkId,
  dex: PerpDex = null,
  /** The exchange's own category per raw asset name, from `perpCategories`. */
  categories: ReadonlyMap<string, string> = new Map()
): MarketRow[] {
  const [meta, ctxs] = data
  const rows: MarketRow[] = []

  meta.universe.forEach((asset, index) => {
    // A delisted market no longer trades; a market the exchange sent no
    // figures for cannot be priced. Neither belongs in the list.
    if (asset.isDelisted) return
    const ctx = ctxs[index]
    if (!ctx) return

    const price = num(ctx.markPx)
    if (price === null) return

    // The shared namespacing rule: ids must be unique across venues or two
    // markets share one key. `translate.ts` owns it so the browser stream
    // names markets identically.
    const marketId = namespaceMarketId(dex?.name ?? "", asset.name)
    const prevDay = num(ctx.prevDayPx)
    // The exchange reports open interest in coins; in dollars it is worth
    // coins × price.
    const openInterest = num(ctx.openInterest)
    rows.push({
      key: marketKey({ protocol: "hyperliquid", network, marketId }),
      marketId,
      // The full namespaced name on purpose: with one flat list, a stripped
      // "BTC" from a sub-exchange would be a lookalike of the real one.
      symbol: marketId,
      quoteAsset: "USDC",
      subExchange: dex?.fullName || dex?.name || null,
      category: normalizeMarketCategory(categories.get(asset.name), !dex),
      sizeDecimals: asset.szDecimals ?? null,
      // Hyperliquid states no tick — its rule is five significant figures,
      // applied in `roundOrderPx`, so there is no per-market number to carry.
      priceTick: null,
      minOrderValueUsd: null,
      marginModes: [],
      maxLeverage: asset.maxLeverage ?? null,
      isolatedOnly: asset.onlyIsolated ?? false,
      // Sub-exchange art keeps its venue namespace. Asking for the bare stock
      // symbol returns the app's HTML shell instead of an image.
      iconUrl: `https://app.hyperliquid.xyz/coins/${encodeURIComponent(marketId)}.svg`,
      price,
      change24h:
        prevDay !== null && prevDay > 0 ? (price - prevDay) / prevDay : null,
      volume24hUsd: num(ctx.dayNtlVlm) ?? 0,
      fundingHourly: num(ctx.funding),
      openInterestUsd: openInterest !== null ? openInterest * price : null,
    })
  })

  return rows
}

/**
 * Every market Hyperliquid lists right now — main exchange and every
 * sub-exchange — with their day's figures.
 *
 * Metadata is one REST response and live figures are one all-venues websocket
 * snapshot. Asking REST once per venue exceeds Hyperliquid's request limit on
 * testnet, where hundreds of venues exist.
 */
export async function fetchHyperliquidMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  const cached = marketCache(network)
  if (cached && Date.now() - cached.at < MARKET_CACHE_MS) {
    return cached.catalog
  }
  const running = marketLoad(network)
  if (running) return running

  const load = loadHyperliquidMarkets(network)
    .then((catalog) => {
      setMarketCache(network, { at: Date.now(), catalog })
      return catalog
    })
    .catch((error) => {
      if (cached && retryableMarketError(error)) {
        setMarketCache(network, { at: Date.now(), catalog: cached.catalog })
        return cached.catalog
      }
      throw error
    })
    .finally(() => setMarketLoad(network, null))
  setMarketLoad(network, load)
  return load
}

async function loadHyperliquidMarkets(
  network: NetworkId
): Promise<MarketCatalog> {
  const client = infoClient(network)
  const [rawDexs, rawMetas, rawCtxs, categories] = await Promise.all([
    client.perpDexs(),
    client.allPerpMetas(),
    allAssetCtxsSnapshot(network),
    // One global coin → category list. Categories are a convenience, so a
    // failed call degrades to the defaults instead of taking the list down.
    client
      .perpCategories()
      .then(
        (response) =>
          new Map(z.array(z.tuple([z.string(), z.string()])).parse(response))
      )
      .catch(() => new Map<string, string>()),
  ])
  const dexs = perpDexsSchema.parse(rawDexs)
  const metas = allMetasSchema.parse(rawMetas)
  const ctxsByDex = new Map(allAssetCtxsSchema.parse(rawCtxs))
  if (metas.length !== dexs.length) {
    throw new Error("Hyperliquid metadata did not match its venues.")
  }

  const catalog: MarketCatalog = {
    protocol: "hyperliquid",
    protocolLabel: "Hyperliquid",
    network,
    networkLabel: network === "mainnet" ? "Mainnet" : "Testnet",
    picker: {
      categories: "full",
      hip3: true,
      funding: true,
      openInterest: true,
    },
    rows: dexs.flatMap((dex, index) => {
      const meta = metas[index]
      const ctxs = ctxsByDex.get(dex?.name ?? "")
      if (!meta || !ctxs) return []
      return toMarketRows([meta, ctxs], network, dex, categories)
    }),
  }
  if (catalog.rows.length === 0) {
    throw new Error("Hyperliquid returned no markets.")
  }
  return catalog
}

function retryableMarketError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /429|http.?5\d\d|rate.?limit|timeout|timed out|econn|enet|socket|websocket|network|fetch failed|temporar|connection closed/i.test(
      error.message
    )
  )
}

const MARKET_CACHE_MS = 60_000
type MarketCacheEntry = { at: number; catalog: MarketCatalog }
type MarketScope = {
  __hyperliquidMarketCaches?: Map<NetworkId, MarketCacheEntry>
  __hyperliquidMarketLoads?: Map<NetworkId, Promise<MarketCatalog>>
}
const marketScope = globalThis as MarketScope

function marketCache(network: NetworkId): MarketCacheEntry | undefined {
  return marketScope.__hyperliquidMarketCaches?.get(network)
}

function setMarketCache(network: NetworkId, entry: MarketCacheEntry): void {
  const caches = (marketScope.__hyperliquidMarketCaches ??= new Map())
  caches.set(network, entry)
}

function marketLoad(network: NetworkId): Promise<MarketCatalog> | undefined {
  return marketScope.__hyperliquidMarketLoads?.get(network)
}

function setMarketLoad(
  network: NetworkId,
  load: Promise<MarketCatalog> | null
): void {
  const loads = (marketScope.__hyperliquidMarketLoads ??= new Map())
  if (load) loads.set(network, load)
  else loads.delete(network)
}
