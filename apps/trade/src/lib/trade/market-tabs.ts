export type MarketTab = "fav" | "all"

/**
 * The one membership rule shared by the market list's two tabs.
 *
 * There was a third — Watch, every market with a smart order on it. The Smart
 * orders panel beside the wallets says that better: it names the kind, where
 * it has got to and what it is worth, rather than putting the coin in a list
 * with everything else. Two lists of the same thing is two to keep in step.
 */
export function marketBelongsInTab(
  tab: MarketTab,
  marketKey: string,
  favorites: ReadonlySet<string>
): boolean {
  return tab === "fav" ? favorites.has(marketKey) : true
}
