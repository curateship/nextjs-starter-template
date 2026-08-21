export type MarketTab = "fav" | "all"

/**
 * The one membership rule shared by the market list's two market tabs.
 *
 * The panel's third tab, Watched, is not a slice of the catalogue and never
 * comes through here: it lists the prices you are waiting at, one row per
 * order, and a market with two waiting orders on it is two rows. There was
 * once a Watch tab that WAS a slice — every market with a smart order on it —
 * and it went, because the Smart orders panel beside the wallets says that
 * better: it names the kind, where it has got to and what it is worth.
 */
export function marketBelongsInTab(
  tab: MarketTab,
  marketKey: string,
  favorites: ReadonlySet<string>
): boolean {
  return tab === "fav" ? favorites.has(marketKey) : true
}
