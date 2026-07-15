type MarketActivity = {
  coin: string
  dayNtlVlm: string
  liveData?: boolean
}

export function hasMarketActivity(market: MarketActivity): boolean {
  return Number(market.dayNtlVlm) > 0
}

export function isMarketVisible(
  market: MarketActivity,
  protectedMarkets: ReadonlySet<string>
): boolean {
  return (
    market.liveData === false ||
    hasMarketActivity(market) ||
    protectedMarkets.has(market.coin)
  )
}
