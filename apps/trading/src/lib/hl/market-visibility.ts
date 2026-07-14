type MarketActivity = {
  coin: string
  dayNtlVlm: string
}

export function hasMarketActivity(market: MarketActivity): boolean {
  return Number(market.dayNtlVlm) > 0
}

export function isMarketVisible(
  market: MarketActivity,
  protectedMarkets: ReadonlySet<string>
): boolean {
  return hasMarketActivity(market) || protectedMarkets.has(market.coin)
}
