import type { MarketRow } from "@/lib/protocols/contracts"

export function minimumOrderLabel(row: MarketRow): string | null {
  return row.minOrderValueUsd === null
    ? null
    : `Smallest order: $${row.minOrderValueUsd}`
}
