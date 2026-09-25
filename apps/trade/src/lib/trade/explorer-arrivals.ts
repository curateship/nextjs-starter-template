export type ArrivalMarket = { key: string; symbol: string; pace: number | null }
export type ExplorerArrival = ArrivalMarket & {
  at: number
  reason: "Top ten" | "Pace"
}

export class ExplorerArrivals {
  private top: Set<string> | null = null
  private pace = new Map<string, number | null>()
  private signature = ""
  private lastSound = -Infinity
  update(
    markets: readonly ArrivalMarket[],
    signature: string,
    threshold: number,
    now: number
  ) {
    const top = new Set(markets.slice(0, 10).map((row) => row.key))
    const initialized = this.top !== null && signature === this.signature
    const arrivals = initialized
      ? markets.flatMap((row): ExplorerArrival[] => {
          const prior = this.pace.get(row.key)
          if (
            row.pace !== null &&
            prior != null &&
            row.pace >= threshold &&
            prior < threshold
          )
            return [{ ...row, at: now, reason: "Pace" }]
          if (top.has(row.key) && !this.top!.has(row.key))
            return [{ ...row, at: now, reason: "Top ten" }]
          return []
        })
      : []
    this.top = top
    this.pace = new Map(markets.map((row) => [row.key, row.pace]))
    this.signature = signature
    return arrivals
  }
  allowSound(now: number, interacted: boolean, enabled: boolean) {
    if (!interacted || !enabled || now - this.lastSound < 10_000) return false
    this.lastSound = now
    return true
  }
}
