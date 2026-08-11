export type MarketTab = "fav" | "all" | "watch"

/** The one membership rule shared by the market list's three tabs. */
export function marketBelongsInTab(
  tab: MarketTab,
  marketKey: string,
  favorites: ReadonlySet<string>,
  watched: ReadonlySet<string>
): boolean {
  if (tab === "fav") return favorites.has(marketKey)
  if (tab === "watch") return watched.has(marketKey)
  return true
}
