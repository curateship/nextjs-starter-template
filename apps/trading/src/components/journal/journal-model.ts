import {
  buildBotRoundTrips,
  type BotRoundTrip,
  type RoundTripFill,
} from "@/components/bots/bot-round-trips"
import type { BotMarketState } from "@/lib/api/bots"
import type { JournalFill } from "@/lib/api/journal"

/**
 * Stored journal fills in the shape the shared round-trip pairing takes, so
 * `buildBotRoundTrips`, `buildBotResult`, `buildBotMarketRows` and
 * `buildBotFillMarkers` all work unchanged. One implementation, two callers —
 * never a second copy that can drift.
 */
export function toRoundTripFills(fills: JournalFill[]): RoundTripFill[] {
  return fills.map((fill) => ({
    id: fill.id,
    market: fill.market,
    side: fill.side,
    px: fill.px,
    sz: fill.sz,
    fee: fill.fee,
    closed_pnl: fill.closedPnl,
    fill_time: fill.fillTime,
  }))
}

/** Distinct markets in the fills, most-recently-traded first. */
export function marketsOf(fills: JournalFill[]): string[] {
  const lastTraded = new Map<string, number>()
  for (const fill of fills) {
    const previous = lastTraded.get(fill.market) ?? 0
    if (fill.fillTime > previous) lastTraded.set(fill.market, fill.fillTime)
  }
  return [...lastTraded.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([market]) => market)
}

/**
 * Which market to open on: the most recently traded one that has a finished
 * trade to look at. The very newest market is often a position still open,
 * and landing there shows an empty trade list, which reads as "nothing here"
 * on first sight of the page.
 */
export function defaultMarket(
  markets: string[],
  fills: RoundTripFill[]
): string {
  for (const market of markets) {
    const closed = buildBotRoundTrips(
      fills.filter((fill) => fill.market === market),
      0
    ).some((trip) => !trip.open)
    if (closed) return market
  }
  return markets[0] ?? ""
}

/**
 * A market's still-open position, in the shape `buildBotResult` reads it from,
 * so an open trade shows as a live row in the trade list instead of vanishing.
 * Real trades carry no bot state, so this stands in for it. Takes trips the
 * caller already paired rather than pairing the fills a second time.
 */
export function openPositionState(
  trips: BotRoundTrip[],
  market: string
): BotMarketState | null {
  const open = trips.find((trip) => trip.open)
  // `szi` comes from the pairing's own position walk. Summing the fills here
  // instead would count a fill that closed a position older than the stored
  // history — the pairing skips those, so the two would disagree.
  if (!open || Math.abs(open.szi) < 1e-9) return null

  return {
    market,
    status: null,
    status_reason: null,
    strategy_state: null,
    paper_position: { szi: open.szi, entryPx: open.entryPx },
    paper_cash: null,
    daily_realized_pnl: 0,
    consecutive_losses: 0,
    cooldown_until: null,
    peak_equity: null,
    last_eval_at: null,
  }
}

/**
 * Markets that currently hold a position, for the markets table's dot. Whether
 * a position is open does not depend on the price, so this passes 0 rather
 * than a live mark — otherwise every market would be re-paired on every tick
 * of the price feed just to redraw the same dot.
 */
export function marketsWithOpenPosition(
  markets: string[],
  fills: RoundTripFill[]
): BotMarketState[] {
  return markets
    .map((market) =>
      openPositionState(
        buildBotRoundTrips(
          fills.filter((fill) => fill.market === market),
          0
        ),
        market
      )
    )
    .filter((state): state is BotMarketState => state !== null)
}

export type JournalSummary = {
  markets: number
  /** Closed round trips across every market. */
  trades: number
  wins: number
  losses: number
  winRate: number | null
  netPnl: number
  netPnlPct: number | null
  fees: number
  maxDrawdownPct: number | null
  /** Realised-equity path across all markets, oldest first. */
  curve: { t: number; eq: number }[]
  firstTradeAt: number | null
  lastTradeAt: number | null
}

/**
 * Whole-account totals, built by pairing each market separately and then
 * merging the closed trips onto one timeline. Markets must never be walked
 * together — a position is per market, so interleaving two markets' fills
 * would invent trades that never happened.
 *
 * `startEquity` is the wallet's capital base: its equity now, less what these
 * trades realised. Null when we could not read it, which leaves the percentage
 * columns blank rather than fabricating a denominator.
 */
export function buildJournalSummary(
  fills: JournalFill[],
  markets: string[],
  accountValue: number
): JournalSummary {
  const rtFills = toRoundTripFills(fills)

  const closed = markets
    .flatMap((market) =>
      buildBotRoundTrips(
        rtFills.filter((fill) => fill.market === market),
        0
      ).filter((trip) => !trip.open)
    )
    .sort((a, b) => (a.exitTime ?? 0) - (b.exitTime ?? 0))

  const netPnl = closed.reduce((sum, trip) => sum + trip.pnl, 0)
  const wins = closed.filter((trip) => trip.pnl > 0).length
  const losses = closed.length - wins
  const fees = fills.reduce((sum, fill) => sum + fill.fee, 0)

  // Equity before these trades ran. If that comes out at or below zero the
  // number is not trustworthy (deposits and withdrawals are not in the fill
  // feed), so the percentage columns stay blank.
  const startEquity =
    accountValue > 0 && accountValue - netPnl > 0 ? accountValue - netPnl : null

  let running = 0
  const curve: { t: number; eq: number }[] = []
  if (startEquity !== null && closed.length > 0) {
    curve.push({ t: closed[0].entryTime, eq: startEquity })
    for (const trip of closed) {
      running += trip.pnl
      curve.push({ t: trip.exitTime as number, eq: startEquity + running })
    }
  }

  let maxDrawdownPct: number | null = null
  if (startEquity !== null && curve.length > 1) {
    let peak = startEquity
    let worst = 0
    for (const point of curve) {
      if (point.eq > peak) peak = point.eq
      if (peak > 0) worst = Math.max(worst, (peak - point.eq) / peak)
    }
    maxDrawdownPct = worst * 100
  }

  return {
    markets: markets.length,
    trades: closed.length,
    wins,
    losses,
    winRate: closed.length > 0 ? (wins / closed.length) * 100 : null,
    netPnl,
    netPnlPct:
      startEquity !== null && closed.length > 0
        ? (netPnl / startEquity) * 100
        : null,
    fees,
    maxDrawdownPct,
    curve,
    firstTradeAt: fills.length ? fills[0].fillTime : null,
    lastTradeAt: fills.length ? fills[fills.length - 1].fillTime : null,
  }
}

/**
 * The wallet's capital base for the per-market %-return columns: equity now
 * less everything these trades realised. Null when unreadable.
 */
export function walletStartEquity(
  accountValue: number,
  netPnl: number
): number | null {
  if (!(accountValue > 0)) return null
  const start = accountValue - netPnl
  return start > 0 ? start : null
}
