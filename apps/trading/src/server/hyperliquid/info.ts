import { InfoClient } from "@nktkas/hyperliquid"

import { buildPerpMarkets } from "@/lib/hl/perp-markets"
import {
  createHttpTransport,
  createReadOnlyHttpTransport,
} from "@/server/hyperliquid/transport"
import type { TradingNetwork } from "@/server/hyperliquid/types"

const META_CACHE_TTL_MS = 60_000

const infoClients = new Map<TradingNetwork, InfoClient>()
const readOnlyInfoClients = new Map<TradingNetwork, InfoClient>()
const metaCache = new Map<
  TradingNetwork,
  { fetchedAt: number; assets: Map<string, AssetInfo> }
>()
const readOnlyMetaCache = new Map<
  TradingNetwork,
  { fetchedAt: number; assets: Map<string, AssetInfo> }
>()

export type AssetInfo = {
  /** Asset index used in order actions. */
  assetId: number
  assetIndex: number
  coin: string
  dex: string
  dexName: string
  collateralToken: number
  collateralSymbol: string
  szDecimals: number
  maxLeverage: number
  onlyIsolated: boolean
}

/**
 * Returns a cached InfoClient for the network. Info queries must always use
 * the account (or vault/subaccount) address, never the agent wallet address —
 * agent wallets sign but hold no account state.
 */
export function getInfoClient(network: TradingNetwork): InfoClient {
  let client = infoClients.get(network)
  if (!client) {
    client = new InfoClient({ transport: createHttpTransport(network) })
    infoClients.set(network, client)
  }
  return client
}

function getReadOnlyInfoClient(network: TradingNetwork): InfoClient {
  let client = readOnlyInfoClients.get(network)
  if (!client) {
    client = new InfoClient({ transport: createReadOnlyHttpTransport(network) })
    readOnlyInfoClients.set(network, client)
  }
  return client
}

export async function getAssetInfo(
  network: TradingNetwork,
  coin: string
): Promise<AssetInfo> {
  const assets = await getAssetMap(network)
  const asset = assets.get(coin)
  if (!asset) {
    throw new Error(`Unknown Hyperliquid market: ${coin}`)
  }
  return asset
}

/**
 * Best-effort sync lookup of a market name by exchange asset id from the warm
 * meta caches. Returns null when no cache holds the asset (e.g. cold start).
 */
export function peekCoinByAssetId(assetId: number): string | null {
  for (const cache of [metaCache, readOnlyMetaCache]) {
    for (const entry of cache.values()) {
      for (const asset of entry.assets.values()) {
        if (asset.assetId === assetId) return asset.coin
      }
    }
  }
  return null
}

/** All active perpetual markets across the default and HIP-3 exchanges. */
export async function getActivePerpMarkets(
  network: TradingNetwork
): Promise<AssetInfo[]> {
  const cached = readOnlyMetaCache.get(network)
  if (cached && Date.now() - cached.fetchedAt < META_CACHE_TTL_MS) {
    return [...cached.assets.values()]
  }

  const assets = await loadAssetMap(getReadOnlyInfoClient(network))
  readOnlyMetaCache.set(network, { fetchedAt: Date.now(), assets })
  return [...assets.values()]
}

async function getAssetMap(
  network: TradingNetwork
): Promise<Map<string, AssetInfo>> {
  const cached = metaCache.get(network)
  if (cached && Date.now() - cached.fetchedAt < META_CACHE_TTL_MS) {
    return cached.assets
  }

  const assets = await loadAssetMap(getInfoClient(network))
  metaCache.set(network, { fetchedAt: Date.now(), assets })
  return assets
}

async function loadAssetMap(info: InfoClient): Promise<Map<string, AssetInfo>> {
  const [dexs, metas, categories, spotMeta] = await Promise.all([
    info.perpDexs(),
    info.allPerpMetas(),
    info.perpCategories(),
    info.spotMeta(),
  ])
  const assets = new Map<string, AssetInfo>()
  for (const market of buildPerpMarkets(
    dexs,
    metas,
    categories,
    spotMeta.tokens
  )) {
    assets.set(market.coin, market)
  }
  return assets
}
