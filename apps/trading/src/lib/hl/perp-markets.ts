export type PerpMarketCategory =
  | "crypto"
  | "stocks"
  | "indices"
  | "commodities"
  | "forex"
  | "other"

export type PerpMarketDefinition = {
  coin: string
  dex: string
  dexName: string
  dexIndex: number
  assetIndex: number
  assetId: number
  category: PerpMarketCategory
  collateralToken: number
  collateralSymbol: string
  szDecimals: number
  maxLeverage: number
  onlyIsolated: boolean
}

type PerpDex = { name: string; fullName: string } | null
type PerpMeta = {
  collateralToken: number
  universe: Array<{
    name: string
    szDecimals: number
    maxLeverage: number
    onlyIsolated?: boolean
    isDelisted?: boolean
  }>
}

export function buildPerpMarkets(
  dexs: PerpDex[],
  metas: PerpMeta[],
  categories: Array<[string, string]>,
  tokens: Array<{ index: number; name: string }>
): PerpMarketDefinition[] {
  const categoryByCoin = new Map(categories)
  const tokenByIndex = new Map(tokens.map((token) => [token.index, token.name]))
  const markets: PerpMarketDefinition[] = []

  metas.forEach((meta, dexIndex) => {
    const dex = dexIndex === 0 ? null : dexs[dexIndex]
    if (dexIndex > 0 && !dex) return

    meta.universe.forEach((asset, assetIndex) => {
      if (asset.isDelisted) return
      markets.push({
        coin: asset.name,
        dex: dex?.name ?? "",
        dexName: dex?.fullName ?? "Hyperliquid",
        dexIndex,
        assetIndex,
        assetId:
          dexIndex === 0
            ? assetIndex
            : 100_000 + dexIndex * 10_000 + assetIndex,
        category: normalizePerpCategory(
          categoryByCoin.get(asset.name),
          dexIndex
        ),
        collateralToken: meta.collateralToken,
        collateralSymbol: tokenByIndex.get(meta.collateralToken) ?? "Unknown",
        szDecimals: asset.szDecimals,
        maxLeverage: asset.maxLeverage,
        onlyIsolated: asset.onlyIsolated ?? false,
      })
    })
  })

  return markets
}

export function normalizePerpCategory(
  category: string | undefined,
  dexIndex: number
): PerpMarketCategory {
  switch (category?.toLowerCase()) {
    case "crypto":
      return "crypto"
    case "stocks":
    case "preipo":
      return "stocks"
    case "indices":
      return "indices"
    case "commodities":
      return "commodities"
    case "fx":
      return "forex"
    default:
      return dexIndex === 0 ? "crypto" : "other"
  }
}
