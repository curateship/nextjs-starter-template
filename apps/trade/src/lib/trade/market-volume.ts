import { z } from "zod"

import type { MarketCatalog } from "@/lib/protocols/contracts"

export type FilteredMarketCatalog = MarketCatalog & {
  hiddenByVolumeKeys: string[]
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
  return {
    ...catalog,
    hiddenByVolumeKeys: catalog.rows
      .filter(
        (row) =>
          !marketMeetsVolumeCutoff(row.volume24hUsd, minimumVolumeUsd)
      )
      .map((row) => row.key),
    rows: catalog.rows.filter((row) =>
      marketMeetsVolumeCutoff(row.volume24hUsd, minimumVolumeUsd)
    ),
  }
}

export function marketWasHiddenByVolume(
  catalogs: FilteredMarketCatalog[],
  marketKey: string
): boolean {
  return catalogs.some((catalog) =>
    catalog.hiddenByVolumeKeys.includes(marketKey)
  )
}
