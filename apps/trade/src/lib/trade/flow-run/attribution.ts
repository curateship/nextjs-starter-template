import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"

/**
 * Telling a flow's trades from the ones somebody placed themselves.
 *
 * **A whole round trip belongs to the run that opened it.** That rule is not a
 * shortcut — it is the only one that works. A stop or a take-profit the
 * exchange is holding fires under an order this app never sent, and a
 * liquidation has no order of ours at all, so asking "did the flow send the
 * order behind this fill?" of every fill would credit a flow with its buys and
 * disown the sale that ended them. What can be known for certain is who opened
 * it, and everything that followed happened to that trade.
 *
 * Where fills from two runs land inside one trip — possible only when a run
 * stopped with a coin still held and a later run added to the same position —
 * the earliest stamped fill wins, because that is the run that put the money
 * in.
 *
 * A trip with no stamped fill at all is nobody's: placed by hand, placed
 * before any of this was recorded, or older than the fill history. Those are
 * counted and shown, never folded in and never quietly dropped.
 *
 * Nothing here reads a database or a clock.
 */

/** Which run each order belongs to, for one wallet. */
export type FlowRunOrderOwners = ReadonlyMap<string, string>

/** The run that opened this trade, or null when nothing says. */
export function tradeRunId(
  trade: { fills: readonly LiveFill[] },
  owners: FlowRunOrderOwners
): string | null {
  // The fills are already oldest first inside a trip, which is what makes
  // "the earliest one that says" a single pass rather than a sort.
  for (const fill of trade.fills) {
    const runId = owners.get(fill.orderId)
    if (runId) return runId
  }
  return null
}

/**
 * Every run's trades in one pass over the wallet's, plus what was nobody's.
 *
 * The list page asks about many runs at once, and asking each of them
 * separately walks the same few thousand trades once per run. This walks them
 * once and drops each into the run that opened it.
 */
export function tradesByRun(
  trades: readonly LiveTrade[],
  owners: FlowRunOrderOwners
): { byRun: Map<string, LiveTrade[]>; notMine: number } {
  const byRun = new Map<string, LiveTrade[]>()
  let notMine = 0
  for (const trade of trades) {
    const runId = tradeRunId(trade, owners)
    if (!runId) {
      notMine += 1
      continue
    }
    const held = byRun.get(runId)
    if (held) held.push(trade)
    else byRun.set(runId, [trade])
  }
  return { byRun, notMine }
}

export type SplitTrades = {
  /** This run's, newest first, in the order they came in. */
  mine: LiveTrade[]
  /** How many of the wallet's other finished trades were not this run's. */
  notMine: number
}

/** One wallet's finished trades, split into this run's and everything else. */
export function splitRunTrades(
  trades: readonly LiveTrade[],
  runId: string,
  owners: FlowRunOrderOwners
): SplitTrades {
  const mine: LiveTrade[] = []
  let notMine = 0
  for (const trade of trades) {
    if (tradeRunId(trade, owners) === runId) mine.push(trade)
    else notMine += 1
  }
  return { mine, notMine }
}

/**
 * Whether the position still open on a coin is this run's.
 *
 * Read off the fills that have not made a finished trade yet — the ones the
 * position is made of — by the same rule as a finished trip. A coin the run
 * has a ladder working on but has not bought yet has no open fills and no
 * position, so it answers false, which is correct: there is nothing held.
 */
export function openPositionIsRunning(
  openFills: readonly LiveFill[],
  marketKey: string,
  runId: string,
  owners: FlowRunOrderOwners
): boolean {
  // Sorted, because the open fills arrive newest first and "the earliest one
  // that says" is the whole rule.
  const mine = openFills
    .filter((fill) => fill.marketKey === marketKey)
    .sort((left, right) => left.at - right.at)
  if (mine.length === 0) return false
  return tradeRunId({ fills: mine }, owners) === runId
}
