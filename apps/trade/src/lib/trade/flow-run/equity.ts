import type { BacktestRunTrade, EquityPoint } from "@/lib/trade/backtest/graph"

/**
 * The money line for a run that is still going, worked out rather than stored.
 *
 * **Nothing here is saved anywhere, and that is deliberate.** A backtest keeps
 * its curve because the run is over the moment it finishes; a live run's line
 * is a fact about fills that are already kept forever, so a stored copy would
 * be a second answer that drifts from the first. The rule this app follows
 * everywhere — a stored copy of a derived figure is a second answer — applies
 * hardest to the one screen somebody reads to decide whether to leave real
 * money running.
 *
 * **What the line means.** It starts at the cap the run was given and adds the
 * money it has actually banked. The cap is a spending limit, not a balance:
 * the wallet's own money moves for reasons nothing to do with this flow, and
 * drawing the wallet here would credit the flow with somebody else's trade.
 *
 * Only the last point counts what open positions are worth right now. There is
 * no record of what they were worth an hour ago, and smearing today's figure
 * backwards would draw a shape that never happened.
 */

/** One open position's contribution, at the price it is marked at right now. */
export type OpenLeg = {
  marketKey: string
  /** When the position was opened, for the money-at-work sweep. */
  openedAt: number
  /** Dollars put in at the entry price. */
  amountUsd: number
  /** Made or lost on paper at today's price, fees already paid included. */
  unrealisedUsd: number
}

export type FlowRunEquity = {
  equity: EquityPoint[]
  /** Money at work at each bar. */
  inPlay: number[]
  /** Every trip, finished or still open, in the shape the graph reads. */
  runTrades: BacktestRunTrade[]
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/**
 * How far apart the points are, chosen off how long the run has been going.
 *
 * A week-old run stamped every five minutes is two thousand points to draw and
 * to send, for a line a few hundred would draw identically. The steps are
 * coarse on purpose — this is the shape of the money over time, not a chart of
 * the price.
 */
export function equityStepMs(spanMs: number): number {
  if (spanMs <= 12 * HOUR) return 5 * MINUTE
  if (spanMs <= 2 * 24 * HOUR) return 15 * MINUTE
  if (spanMs <= 14 * 24 * HOUR) return HOUR
  return 4 * HOUR
}

export type FlowRunEquityInput = {
  /** Finished round trips of this run, in any order. */
  trades: readonly {
    marketKey: string
    openedAt: number
    closedAt: number
    amountUsd: number
    pnl: number
    ending: string
  }[]
  /** What the run is still holding. */
  open: readonly OpenLeg[]
  /** The most this run may spend — where its line starts. */
  capUsd: number
  startedAt: number
  /** When it stopped, or now while it is still going. */
  endAt: number
}

export function buildFlowRunEquity(input: FlowRunEquityInput): FlowRunEquity {
  const step = equityStepMs(Math.max(0, input.endAt - input.startedAt))
  const times: number[] = []
  for (let at = input.startedAt; at < input.endAt; at += step) times.push(at)
  // The last point is always the moment asked about, whatever the step landed
  // on — otherwise the head of the line is up to four hours out of date and
  // the figure beside it is not.
  times.push(Math.max(input.startedAt, input.endAt))

  const runTrades: BacktestRunTrade[] = input.trades.map((trade) => ({
    coin: trade.marketKey,
    entryAt: trade.openedAt,
    exitAt: trade.closedAt,
    amountUsd: trade.amountUsd,
    pnl: trade.pnl,
    liquidated: trade.ending === "liquidated",
  }))
  for (const leg of input.open) {
    runTrades.push({
      coin: leg.marketKey,
      entryAt: leg.openedAt,
      // Still running, so it has no exit — which is what makes it count as
      // money at work all the way to the head of the line.
      exitAt: null,
      amountUsd: leg.amountUsd,
      pnl: 0,
      liquidated: false,
    })
  }

  const banked = [...input.trades].sort(
    (left, right) => left.closedAt - right.closedAt
  )
  const unrealised = input.open.reduce((sum, leg) => sum + leg.unrealisedUsd, 0)

  // Money at work is swept once over the trades rather than asked of every
  // bar — the same difference-array trick the backtest graph uses, and for the
  // same reason: a long run against a few thousand trades is millions of
  // comparisons done the obvious way, on every redraw.
  const edges = new Array<number>(times.length + 1).fill(0)
  const addWork = (from: number, to: number, usd: number) => {
    const first = Math.max(0, barIndex(times, from))
    const last = barIndex(times, to)
    if (last < first) return
    edges[first] += usd
    edges[last + 1] -= usd
  }
  for (const trade of input.trades) {
    addWork(trade.openedAt, trade.closedAt, trade.amountUsd)
  }
  for (const leg of input.open) {
    addWork(leg.openedAt, times[times.length - 1], leg.amountUsd)
  }

  const equity: EquityPoint[] = []
  const inPlay: number[] = []
  let taken = 0
  let next = 0
  let atWork = 0
  for (let bar = 0; bar < times.length; bar++) {
    const at = times[bar]
    while (next < banked.length && banked[next].closedAt <= at) {
      taken += banked[next].pnl
      next += 1
    }
    const head = bar === times.length - 1
    equity.push({ t: at, usd: input.capUsd + taken + (head ? unrealised : 0) })
    atWork += edges[bar]
    inPlay.push(atWork)
  }

  return { equity, inPlay, runTrades }
}

/** Which point a moment falls on: the last one at or before it. */
function barIndex(times: readonly number[], at: number): number {
  let low = 0
  let high = times.length - 1
  let found = 0
  while (low <= high) {
    const mid = (low + high) >> 1
    if (times[mid] <= at) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}
