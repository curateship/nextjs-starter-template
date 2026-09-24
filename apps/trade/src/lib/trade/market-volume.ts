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

/**
 * The market a dashboard opens on when nothing names one: the busiest by
 * 24-hour dollar volume that the lists show, or of every row when the
 * volume setting hides them all.
 *
 * The account remembers a last market per exchange, so this is the first
 * visit to an exchange, when there is nothing to reopen. With the market
 * list folded away, that was an empty chart and no picker to choose from.
 * Null only while the list has not arrived or is empty.
 */
export function busiestMarketKey(
  catalogs: readonly FilteredMarketCatalog[],
  protocol: string,
  network: string
): string | null {
  const here = catalogs.filter(
    (catalog) => catalog.protocol === protocol && catalog.network === network
  )
  const shown = here.flatMap((catalog) => catalog.rows)
  const rows = shown.length > 0 ? shown : here.flatMap(allCatalogMarketRows)
  let busiest: MarketRow | null = null
  for (const row of rows) {
    if (!busiest || row.volume24hUsd > busiest.volume24hUsd) busiest = row
  }
  return busiest?.key ?? null
}
