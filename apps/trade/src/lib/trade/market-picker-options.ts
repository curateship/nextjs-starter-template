import type {
  MarketPickerCapabilities,
  MarketRow,
} from "@/lib/protocols/contracts"

export type MarketPickerView =
  "favorites" | "all" | "crypto" | "tradfi" | "hip3" | "trending"

export type MarketPickerSortKey = "market" | "change" | "volume"

const ALWAYS_VISIBLE: MarketPickerView[] = ["favorites", "all"]

export function marketPickerViews(
  capabilities: MarketPickerCapabilities,
  rows: readonly MarketRow[]
): MarketPickerView[] {
  const views = [...ALWAYS_VISIBLE]
  const hasTradFi = rows.some((row) => row.category !== "crypto")
  const showCategories =
    capabilities.categories === "full" ||
    (capabilities.categories === "catalog" && hasTradFi)

  if (showCategories) views.push("crypto", "tradfi")
  if (capabilities.hip3) views.push("hip3")
  views.push("trending")
  return views
}
