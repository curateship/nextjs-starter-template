type MarketActivity = {
  coin: string
  /** Absent for sources with no volume feed (e.g. Binance backtest rows). */
  dayNtlVlm?: string
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
    // No volume feed at all — activity can't be judged, so don't hide it.
    market.dayNtlVlm === undefined ||
    hasMarketActivity(market) ||
    protectedMarkets.has(market.coin)
  )
}
