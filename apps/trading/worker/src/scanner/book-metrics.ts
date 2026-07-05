// Pure order book analysis: liquidity bands, imbalance, walls.

export type BookLevel = { px: string; sz: string }

export type BookWall = {
  side: "bid" | "ask"
  px: number
  sz: number
  usd: number
  /** Distance from mid as a fraction (0.005 = 0.5%). */
  distance: number
}

export type BookMetricsResult = {
  mid: number
  spreadBps: number
  /** USD liquidity within 0.5/1/2% of mid, per side. */
  bands: { pct: number; bidUsd: number; askUsd: number }[]
  /** Bid/ask USD ratio within the 1% band (>1 = bid heavy). */
  imbalance: number | null
  walls: BookWall[]
}

export type BookMetricsOptions = {
  /** A wall is a level ≥ this multiple of the median level size. */
  wallMultiple: number
  /** Only look for walls within this fraction of mid. */
  wallMaxDistance: number
  /** Ignore walls below this USD size. */
  wallMinUsd: number
}

export const DEFAULT_BOOK_OPTIONS: BookMetricsOptions = {
  wallMultiple: 5,
  wallMaxDistance: 0.02,
  wallMinUsd: 50_000,
}

const BAND_PCTS = [0.005, 0.01, 0.02]

export function bookMetrics(
  bids: BookLevel[],
  asks: BookLevel[],
  opts: BookMetricsOptions = DEFAULT_BOOK_OPTIONS
): BookMetricsResult | null {
  const bestBid = Number(bids[0]?.px)
  const bestAsk = Number(asks[0]?.px)
  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || bestBid <= 0) {
    return null
  }
  const mid = (bestBid + bestAsk) / 2
  const spreadBps = ((bestAsk - bestBid) / mid) * 10_000

  const bands = BAND_PCTS.map((pct) => ({
    pct,
    bidUsd: bandUsd(bids, mid, pct, "bid"),
    askUsd: bandUsd(asks, mid, pct, "ask"),
  }))

  const onePct = bands[1]
  const imbalance =
    onePct.askUsd > 0 ? onePct.bidUsd / onePct.askUsd : null

  const walls = [
    ...findWalls(bids, mid, "bid", opts),
    ...findWalls(asks, mid, "ask", opts),
  ].sort((a, b) => a.distance - b.distance)

  return { mid, spreadBps, bands, imbalance, walls }
}

function bandUsd(
  levels: BookLevel[],
  mid: number,
  pct: number,
  side: "bid" | "ask"
): number {
  let usd = 0
  for (const level of levels) {
    const px = Number(level.px)
    const inBand =
      side === "bid" ? px >= mid * (1 - pct) : px <= mid * (1 + pct)
    if (!inBand) break
    usd += px * Number(level.sz)
  }
  return usd
}

function findWalls(
  levels: BookLevel[],
  mid: number,
  side: "bid" | "ask",
  opts: BookMetricsOptions
): BookWall[] {
  const inRange = levels.filter((level) => {
    const px = Number(level.px)
    return Math.abs(px - mid) / mid <= opts.wallMaxDistance
  })
  if (inRange.length < 4) return []

  const sizes = inRange.map((level) => Number(level.sz)).sort((a, b) => a - b)
  const median = sizes[Math.floor(sizes.length / 2)]
  if (median <= 0) return []

  const walls: BookWall[] = []
  for (const level of inRange) {
    const px = Number(level.px)
    const sz = Number(level.sz)
    const usd = px * sz
    if (sz >= median * opts.wallMultiple && usd >= opts.wallMinUsd) {
      walls.push({
        side,
        px,
        sz,
        usd,
        distance: Math.abs(px - mid) / mid,
      })
    }
  }
  return walls
}
