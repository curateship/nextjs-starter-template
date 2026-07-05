// Pure fill/portfolio math for wallet stats. No I/O — unit tested directly.

export type FillLike = {
  coin: string
  px: string
  sz: string
  side: "B" | "A"
  time: number
  startPosition: string
  closedPnl: string
  dir: string
  crossed: boolean
}

export type FillStats = {
  fillCount: number
  avgTradeNotional: number | null
  /** Share of closing fills with positive realized PnL. */
  winRate: number | null
  largestWin: number | null
  largestLoss: number | null
  topCoins: { coin: string; notional: number; fills: number }[]
  avgHoldMinutes: number | null
  /** Share of fills that were taker (crossed). */
  takerRatio: number | null
  oldestFillAt: number | null
}

export function computeFillStats(fills: FillLike[]): FillStats {
  if (fills.length === 0) {
    return {
      fillCount: 0,
      avgTradeNotional: null,
      winRate: null,
      largestWin: null,
      largestLoss: null,
      topCoins: [],
      avgHoldMinutes: null,
      takerRatio: null,
      oldestFillAt: null,
    }
  }

  let totalNotional = 0
  let wins = 0
  let closes = 0
  let largestWin: number | null = null
  let largestLoss: number | null = null
  let taker = 0
  let oldest = Number.POSITIVE_INFINITY
  const byCoin = new Map<string, { notional: number; fills: number }>()

  for (const fill of fills) {
    const notional = Number(fill.px) * Number(fill.sz)
    totalNotional += notional
    if (fill.crossed) taker += 1
    oldest = Math.min(oldest, fill.time)

    const coinAgg = byCoin.get(fill.coin) ?? { notional: 0, fills: 0 }
    coinAgg.notional += notional
    coinAgg.fills += 1
    byCoin.set(fill.coin, coinAgg)

    const pnl = Number(fill.closedPnl)
    if (fill.dir.startsWith("Close") || pnl !== 0) {
      closes += 1
      if (pnl > 0) {
        wins += 1
        largestWin = Math.max(largestWin ?? pnl, pnl)
      } else if (pnl < 0) {
        largestLoss = Math.min(largestLoss ?? pnl, pnl)
      }
    }
  }

  const topCoins = [...byCoin.entries()]
    .map(([coin, agg]) => ({ coin, ...agg }))
    .sort((a, b) => b.notional - a.notional)
    .slice(0, 5)

  return {
    fillCount: fills.length,
    avgTradeNotional: totalNotional / fills.length,
    winRate: closes > 0 ? wins / closes : null,
    largestWin,
    largestLoss,
    topCoins,
    avgHoldMinutes: computeAvgHoldMinutes(fills),
    takerRatio: taker / fills.length,
    oldestFillAt: Number.isFinite(oldest) ? oldest : null,
  }
}

/**
 * Average position-episode length: per coin, an episode runs from the fill
 * that takes the position off zero to the fill that returns it to zero.
 * Episodes still open at the end of the window are ignored.
 */
export function computeAvgHoldMinutes(fills: FillLike[]): number | null {
  const sorted = [...fills].sort((a, b) => a.time - b.time)
  const open = new Map<string, number>()
  const durations: number[] = []

  for (const fill of sorted) {
    const start = Number(fill.startPosition)
    const delta = Number(fill.sz) * (fill.side === "B" ? 1 : -1)
    const end = start + delta

    if (isZero(start) && !isZero(end)) {
      open.set(fill.coin, fill.time)
    } else if (!isZero(start) && isZero(end)) {
      const openedAt = open.get(fill.coin)
      if (openedAt !== undefined) {
        durations.push(fill.time - openedAt)
        open.delete(fill.coin)
      }
    }
  }

  if (durations.length === 0) return null
  const avgMs = durations.reduce((sum, d) => sum + d, 0) / durations.length
  return avgMs / 60_000
}

function isZero(value: number): boolean {
  return Math.abs(value) < 1e-9
}

/** Window PnL / equity extraction from HL portfolio periods. */
export type PortfolioPeriod = {
  accountValueHistory: [number, string][]
  pnlHistory: [number, string][]
}

export function extractWindowPnl(period: PortfolioPeriod | undefined): number | null {
  const history = period?.pnlHistory
  if (!history || history.length === 0) return null
  return Number(history[history.length - 1][1])
}

export function extractAccountValue(
  period: PortfolioPeriod | undefined
): number | null {
  const history = period?.accountValueHistory
  if (!history || history.length === 0) return null
  return Number(history[history.length - 1][1])
}

/** Downsamples an equity history to at most `max` evenly spaced points. */
export function downsampleHistory(
  history: [number, string][],
  max = 200
): { time: number; value: number }[] {
  const points = history.map(([time, value]) => ({
    time,
    value: Number(value),
  }))
  if (points.length <= max) return points
  const step = points.length / max
  const sampled: { time: number; value: number }[] = []
  for (let i = 0; i < max; i += 1) {
    sampled.push(points[Math.floor(i * step)])
  }
  const last = points[points.length - 1]
  if (sampled[sampled.length - 1] !== last) sampled.push(last)
  return sampled
}
