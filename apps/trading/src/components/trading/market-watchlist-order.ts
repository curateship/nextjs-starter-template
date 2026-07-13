export function pinFavoriteMarkets<T extends { row: { coin: string } }>(
  markets: T[],
  favorites: ReadonlySet<string>
): T[] {
  const pinned: T[] = []
  const remaining: T[] = []

  for (const market of markets) {
    const group = favorites.has(market.row.coin) ? pinned : remaining
    group.push(market)
  }

  return [...pinned, ...remaining]
}
