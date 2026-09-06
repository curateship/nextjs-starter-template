import type { LiveTradeEnding } from "@/lib/trade/live-trades"
import { hourOf } from "@/lib/trade/pnl/periods"

/**
 * One finished real-money trade, with the four facts the cards and the score
 * group by that a Journal row does not carry on its own.
 */
export type PnlTrade = {
  id: string
  symbol: string
  direction: "long" | "short"
  openedAt: number
  closedAt: number
  heldMs: number
  entryPx: number
  exitPx: number
  sz: number
  amountUsd: number
  /** Made or lost, the exchange's figure less what it charged. */
  pnl: number
  /** What the exchange charged across every fill of the trade. */
  fees: number
  /** A stop sat on the position while it was open, or a stop is what ended it. */
  hadStop: boolean
  /** The entry went out against the person's own trading rules. */
  overrode: boolean
  ending: LiveTradeEnding
}

/** The five ways the cards split the trades. */
const PATTERN_KINDS = ["coin", "hour", "side", "stop", "rules"] as const
export type PatternKind = (typeof PATTERN_KINDS)[number]

const PATTERN_TITLES: Record<PatternKind, string> = {
  coin: "By coin",
  hour: "By hour of entry",
  side: "Long or short",
  stop: "With or without a stop",
  rules: "Rules kept or overridden",
}

export type PatternGroup = {
  label: string
  trades: number
  dollars: number
}

export type PatternGrouping = {
  kind: PatternKind
  title: string
  /** Every group, biggest dollars first. Their dollars add up to `total`. */
  groups: PatternGroup[]
}

export type PatternCards = {
  /** Trades that made money, or lost it, depending on the outcome asked for. */
  trades: number
  total: number
  groupings: PatternGrouping[]
}

/** "22:00 to 23:00", the Toronto hour the trade was entered in. */
export function hourLabel(hour: number): string {
  const next = (hour + 1) % 24
  return `${String(hour).padStart(2, "0")}:00 to ${String(next).padStart(2, "0")}:00`
}

function labelFor(kind: PatternKind, trade: PnlTrade): string {
  switch (kind) {
    case "coin":
      return trade.symbol
    case "hour":
      return hourLabel(hourOf(trade.openedAt))
    case "side":
      return trade.direction === "long" ? "Longs" : "Shorts"
    case "stop":
      return trade.hadStop ? "With a stop" : "No stop"
    case "rules":
      return trade.overrode ? "Rules overridden" : "Rules kept"
  }
}

/**
 * The winning or losing patterns of a period: plain counts and dollars, no
 * opinion. Every grouping is built from the same trades, so the dollars of
 * its groups always add back up to the period's made or lost total. A trade
 * that broke even belongs to neither card.
 */
export function groupPatterns(
  trades: readonly PnlTrade[],
  outcome: "made" | "lost"
): PatternCards {
  const picked = trades.filter((trade) =>
    outcome === "made" ? trade.pnl > 0 : trade.pnl < 0
  )
  const total = picked.reduce((sum, trade) => sum + trade.pnl, 0)
  const groupings = PATTERN_KINDS.map((kind): PatternGrouping => {
    const byLabel = new Map<string, PatternGroup>()
    for (const trade of picked) {
      const label = labelFor(kind, trade)
      const group = byLabel.get(label)
      if (group) {
        group.trades += 1
        group.dollars += trade.pnl
      } else {
        byLabel.set(label, { label, trades: 1, dollars: trade.pnl })
      }
    }
    return {
      kind,
      title: PATTERN_TITLES[kind],
      groups: [...byLabel.values()].sort(
        (left, right) =>
          Math.abs(right.dollars) - Math.abs(left.dollars) ||
          left.label.localeCompare(right.label)
      ),
    }
  })
  return { trades: picked.length, total, groupings }
}
