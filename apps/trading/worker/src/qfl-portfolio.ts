import type {
  QflPortfolioCandidate,
  QflPortfolioControl,
} from "./strategies/contract"

const score = (candidate: QflPortfolioCandidate) => [
  candidate.respectRate ?? -1,
  candidate.volumeMultiple,
  candidate.dailyVolumeUsd,
]

function compareCandidates(
  left: QflPortfolioCandidate,
  right: QflPortfolioCandidate
) {
  const a = score(left)
  const b = score(right)
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return b[index] - a[index]
  }
  return left.market.localeCompare(right.market)
}

/** One synchronous reservation bank shared by every market runner of a bot. */
export class QflPortfolio implements QflPortfolioControl {
  private readonly candidates = new Map<
    number,
    Map<string, QflPortfolioCandidate>
  >()
  private readonly reservations = new Map<string, number>()
  private readonly decisions = new Map<number, Set<string>>()
  private readonly observations = new Map<number, Set<string>>()
  private readonly expectedMarkets: Set<string>
  private readonly equityDeltas = new Map<string, number>()
  private startingEquity: number | null = null
  private peakReserved = 0
  private readonly maximumPct: number

  // Explicit field assignment (not a constructor parameter property) so the
  // browser can import the shared engine under the app's erasable-syntax rule.
  constructor(maximumPct: number, markets: Iterable<string> = []) {
    this.maximumPct = maximumPct
    this.expectedMarkets = new Set(markets)
  }

  private prune(before: number) {
    for (const time of this.candidates.keys()) {
      if (time < before) this.candidates.delete(time)
    }
    for (const time of this.decisions.keys()) {
      if (time < before) this.decisions.delete(time)
    }
    for (const time of this.observations.keys()) {
      if (time < before) this.observations.delete(time)
    }
  }

  submit(candidate: QflPortfolioCandidate) {
    const group = this.candidates.get(candidate.candleTime) ?? new Map()
    group.set(candidate.market, candidate)
    this.candidates.set(candidate.candleTime, group)
    this.prune(candidate.candleTime - 86_400_000)
  }

  observe(market: string, candleTime: number) {
    const markets = this.observations.get(candleTime) ?? new Set<string>()
    markets.add(market)
    this.observations.set(candleTime, markets)
    this.prune(candleTime - 86_400_000)
  }

  ready(candleTime: number) {
    if (this.expectedMarkets.size === 0) return true
    const observed = this.observations.get(candleTime)
    if (!observed) return false
    return [...this.expectedMarkets].every((market) => observed.has(market))
  }

  removeMarket(market: string) {
    this.expectedMarkets.delete(market)
    this.release(market)
    this.equityDeltas.delete(market)
    for (const observations of this.observations.values()) {
      observations.delete(market)
    }
    for (const candidates of this.candidates.values()) {
      candidates.delete(market)
    }
  }

  reserve(market: string, candleTime: number, exposurePct: number): boolean {
    if (this.reservations.has(market)) return true
    if (!this.ready(candleTime)) return false
    let winners = this.decisions.get(candleTime)
    if (!winners) {
      const group = this.candidates.get(candleTime)
      if (!group?.has(market)) return false
      const free = this.maximumPct - this.reservedPct()
      winners = new Set<string>()
      let remaining = free
      for (const candidate of [...group.values()].sort(compareCandidates)) {
        if (candidate.exposurePct > remaining + 1e-9) continue
        winners.add(candidate.market)
        remaining -= candidate.exposurePct
      }
      this.decisions.set(candleTime, winners)
    }
    const free = this.maximumPct - this.reservedPct()
    if (!winners.has(market) || exposurePct > free + 1e-9) return false
    this.reservations.set(market, exposurePct)
    this.trackPeak()
    return true
  }

  restore(market: string, exposurePct: number): boolean {
    if (this.reservations.has(market)) return true
    if (this.reservedPct() + exposurePct > this.maximumPct + 1e-9) return false
    this.reservations.set(market, exposurePct)
    this.trackPeak()
    return true
  }

  release(market: string) {
    this.reservations.delete(market)
  }

  reservedPct() {
    let total = 0
    for (const value of this.reservations.values()) total += value
    return total
  }

  private trackPeak() {
    const total = this.reservedPct()
    if (total > this.peakReserved) this.peakReserved = total
  }

  /** The most of the wallet ever committed at once, across the whole run. */
  peakReservedPct() {
    return this.peakReserved
  }

  // DCA reserves only the exposure that has actually filled — growing as the
  // ladder builds and clearing when flat — rather than the whole pot up front,
  // so a market holding one small rung doesn't block the wallet for everyone.
  setExposure(market: string, exposurePct: number) {
    if (exposurePct > 1e-9) this.reservations.set(market, exposurePct)
    else this.reservations.delete(market)
    this.trackPeak()
  }

  // What a market may still hold: the cap minus everyone else's reservations
  // (its own current reservation doesn't count against itself).
  remaining(market: string): number {
    return (
      this.maximumPct - this.reservedPct() + (this.reservations.get(market) ?? 0)
    )
  }

  reportEquity(market: string, equity: number, startingEquity: number) {
    if (!(Number.isFinite(equity) && startingEquity > 0)) return
    this.startingEquity ??= startingEquity
    this.equityDeltas.set(market, equity - startingEquity)
  }

  equity(fallback: number) {
    if (this.startingEquity === null || this.equityDeltas.size === 0) {
      return fallback
    }
    let value = this.startingEquity
    for (const delta of this.equityDeltas.values()) value += delta
    return value
  }
}
