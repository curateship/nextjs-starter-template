import { InfoClient } from "@nktkas/hyperliquid"

import { createReadOnlyHttpTransport } from "@/server/hyperliquid/transport"

const UNIVERSE_CACHE_TTL_MS = 5 * 60_000

let infoClient: InfoClient | null = null
let universeCache: { fetchedAt: number; assets: ScannerAsset[] } | null = null
let universeRequest: Promise<ScannerAsset[]> | null = null

export type ScannerAsset = {
  coin: string
  szDecimals: number
  maxLeverage: number
  /** 24h notional volume in USD. */
  dayNotionalVolume: number
  markPx: number
}

/** Read-only mainnet InfoClient for scanner data (public info endpoints). */
export function getScannerInfoClient(): InfoClient {
  if (!infoClient) {
    infoClient = new InfoClient({
      transport: createReadOnlyHttpTransport("mainnet"),
    })
  }
  return infoClient
}

/**
 * Mainnet perp universe with 24h volumes, cached for 5 minutes. Volume is
 * used to pick trade subscriptions, default book coins, and the "hide tiny
 * coins" filter.
 */
export async function getScannerUniverse(): Promise<ScannerAsset[]> {
  if (
    universeCache &&
    Date.now() - universeCache.fetchedAt < UNIVERSE_CACHE_TTL_MS
  ) {
    return universeCache.assets
  }

  if (!universeRequest) {
    universeRequest = getScannerInfoClient()
      .metaAndAssetCtxs()
      .then(([meta, ctxs]) => {
        const assets: ScannerAsset[] = []
        meta.universe.forEach((asset, index) => {
          if (asset.isDelisted) return
          const ctx = ctxs[index]
          assets.push({
            coin: asset.name,
            szDecimals: asset.szDecimals,
            maxLeverage: asset.maxLeverage,
            dayNotionalVolume: ctx ? Number(ctx.dayNtlVlm) : 0,
            markPx: ctx ? Number(ctx.markPx) : 0,
          })
        })
        assets.sort((a, b) => b.dayNotionalVolume - a.dayNotionalVolume)
        universeCache = { fetchedAt: Date.now(), assets }
        return assets
      })
      .finally(() => {
        universeRequest = null
      })
  }

  try {
    return await universeRequest
  } catch (error) {
    if (universeCache) return universeCache.assets
    throw error
  }
}
