import { InfoClient } from "@nktkas/hyperliquid"

import { buildPerpMarkets } from "@/lib/hl/perp-markets"
import { createHttpTransport } from "@/server/hyperliquid/transport"
import type { TradingNetwork } from "@/server/hyperliquid/types"

const META_CACHE_TTL_MS = 60_000

const infoClients = new Map<TradingNetwork, InfoClient>()
const metaCache = new Map<
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

async function getAssetMap(
  network: TradingNetwork
): Promise<Map<string, AssetInfo>> {
  const cached = metaCache.get(network)
  if (cached && Date.now() - cached.fetchedAt < META_CACHE_TTL_MS) {
    return cached.assets
  }

  const info = getInfoClient(network)
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
  metaCache.set(network, { fetchedAt: Date.now(), assets })
  return assets
}
