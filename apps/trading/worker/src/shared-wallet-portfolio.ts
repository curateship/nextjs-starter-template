import type {
  SharedWalletCandidate,
  SharedWalletPortfolioControl,
} from "./strategies/contract"

const score = (candidate: SharedWalletCandidate) => [
  candidate.volumeMultiple,
  candidate.dailyVolumeUsd,
]

function compareCandidates(
  left: SharedWalletCandidate,
  right: SharedWalletCandidate
) {
  const a = score(left)
  const b = score(right)
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return b[index] - a[index]
  }
  return left.market.localeCompare(right.market)
}

/**
 * How close to the high-water mark still counts as "at the peak", as a share of
 * it. The wallet's deployment drifts continuously with price, so it touches its
 * exact top on one bar and only one — a tight band would answer "no time at all"
 * on every run. Nine tenths of the peak is the band that answers the question
 * actually being asked: how long was the wallet up at its heaviest?
 */
const PEAK_BAND_FRACTION = 0.9

/** One synchronous reservation bank shared by every market runner of a bot. */
export class SharedWalletPortfolio implements SharedWalletPortfolioControl {
  private readonly candidates = new Map<
    number,
    Map<string, SharedWalletCandidate>
  >()
  private readonly reservations = new Map<string, number>()
  private readonly decisions = new Map<number, Set<string>>()
  private readonly observations = new Map<number, Set<string>>()
  private readonly expectedMarkets: Set<string>
  private readonly equityDeltas = new Map<string, number>()
  private startingEquity: number | null = null
  private peakReserved = 0
  /** Bar time of the moment the peak was set; null until anything deploys. */
  private peakAtMs: number | null = null
  /** The replay stamps each bar's time here before processing it. */
  private nowMs: number | null = null
  private samples = 0
  private reservedTotal = 0
  /**
   * Sampled deployment rounded to whole percent → how many bars sat there.
   * The peak is only known once the run ends, so the bars can't be counted
   * against it as they go; keeping the shape of the whole run (a hundred-odd
   * entries) lets the tally happen at the end, against the real high-water
   * mark, instead of against whatever the peak happened to be at the time.
   */
  private readonly reservedBars = new Map<number, number>()
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

  submit(candidate: SharedWalletCandidate) {
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
    if (total > this.peakReserved) {
      this.peakReserved = total
      this.peakAtMs = this.nowMs
    }
  }

  /** Called once per bar by the replay so the peak can carry its date. */
  noteTime(ms: number) {
    this.nowMs = ms
  }

  /** When the wallet hit its high-water mark, ms since epoch; null if never. */
  peakAt() {
    return this.peakAtMs
  }

  /** The most of the wallet ever committed at once, across the whole run. */
  peakReservedPct() {
    return this.peakReserved
  }

  /**
   * Records how much of the wallet is committed right now. The replay calls
   * this once per bar, so the two readings below are weighted by TIME rather
   * than by event: a reservation held for 300 bars counts 300 times, not once.
   */
  sample() {
    const total = this.reservedPct()
    this.samples += 1
    this.reservedTotal += total
    const bar = Math.round(total)
    this.reservedBars.set(bar, (this.reservedBars.get(bar) ?? 0) + 1)
  }

  /** Average share of the wallet deployed across the sampled bars, percent. */
  avgReservedPct() {
    return this.samples > 0 ? this.reservedTotal / this.samples : 0
  }

  /**
   * How many sampled bars the wallet spent up at its high-water mark (within
   * PEAK_BAND_FRACTION of it) — how long the peak lasted, rather than merely
   * that it happened. Zero when the wallet was never deployed, or when the peak
   * came and went inside a single bar. The caller turns bars into real time.
   */
  barsAtPeak() {
    if (this.samples === 0 || this.peakReserved <= 0) return 0
    const floor = this.peakReserved * PEAK_BAND_FRACTION
    let atPeak = 0
    for (const [bar, count] of this.reservedBars) {
      if (bar >= floor) atPeak += count
    }
    return atPeak
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
