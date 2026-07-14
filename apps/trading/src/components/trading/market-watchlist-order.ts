export function filterMarketsByCoins<T extends { row: { coin: string } }>(
  markets: T[],
  coins: ReadonlySet<string>
): T[] {
  return markets.filter((market) => coins.has(market.row.coin))
}
