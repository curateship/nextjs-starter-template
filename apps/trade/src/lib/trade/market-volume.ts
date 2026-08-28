import { z } from "zod"

import type { MarketCatalog, MarketRow } from "@/lib/protocols/contracts"

export type FilteredMarketCatalog = MarketCatalog & {
  /**
   * Full rows for markets omitted from the lists.
   *
   * The cutoff is only a list filter. A link, remembered market, position or
   * order can still open one of these markets, so the chart keeps the market's
   * rules and can trade it normally.
   */
  hiddenByVolumeRows: MarketRow[]
}

/** A deliberately generous ceiling that still refuses accidental infinities. */
export const MAXIMUM_MARKET_VOLUME_USD = 1_000_000_000_000_000

export const minimumMarketVolumeSchema = z
  .number()
  .finite()
  .min(0)
  .max(MAXIMUM_MARKET_VOLUME_USD)

/** A first visit keeps the existing rule: markets with no volume stay hidden. */
export function readMinimumMarketVolume(value: unknown): number {
  const parsed = minimumMarketVolumeSchema.safeParse(value)
  return parsed.success ? parsed.data : 0
}

export function marketMeetsVolumeCutoff(
  volume24hUsd: number,
  minimumVolumeUsd: number
): boolean {
  return volume24hUsd > 0 && volume24hUsd >= minimumVolumeUsd
}

export function filterMarketsByVolume(
  catalog: MarketCatalog,
  minimumVolumeUsd: number
): FilteredMarketCatalog {
  const hiddenByVolumeRows = catalog.rows.filter(
    (row) => !marketMeetsVolumeCutoff(row.volume24hUsd, minimumVolumeUsd)
  )
  return {
    ...catalog,
    hiddenByVolumeRows,
    rows: catalog.rows.filter((row) =>
      marketMeetsVolumeCutoff(row.volume24hUsd, minimumVolumeUsd)
    ),
  }
}

/** Find a market whether or not the volume cutoff omitted it from the lists. */
export function catalogMarketRow(
  catalog: FilteredMarketCatalog,
  marketKey: string
): MarketRow | undefined {
  return (
    catalog.rows.find((row) => row.key === marketKey) ??
    catalog.hiddenByVolumeRows.find((row) => row.key === marketKey)
  )
}

/** Every market for chart, position and order data. Lists keep using `rows`. */
export function allCatalogMarketRows(
  catalog: FilteredMarketCatalog
): MarketRow[] {
  return [...catalog.rows, ...catalog.hiddenByVolumeRows]
}
