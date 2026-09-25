import { describe, expect, it } from "vitest"

import {
  groupPatterns,
  hourLabel,
  type PnlTrade,
} from "@/lib/trade/pnl/patterns"
import { dayStart } from "@/lib/trade/pnl/periods"

function trade(
  over: Partial<PnlTrade> & { id: string; pnl: number }
): PnlTrade {
  return {
    symbol: "BTC",
    direction: "long",
    openedAt: dayStart("2026-09-01") + 22 * 3_600_000,
    closedAt: dayStart("2026-09-02"),
    heldMs: 7_200_000,
    entryPx: 100,
    exitPx: 101,
    sz: 1,
    amountUsd: 100,
    fees: 0.1,
    hadStop: true,
    overrode: false,
    ending: "closed",
    ...over,
  }
}

const trades = [
  trade({ id: "a", pnl: -300, direction: "short", hadStop: false }),
  trade({
    id: "b",
    pnl: -110,
    direction: "short",
    hadStop: false,
    symbol: "ETH",
  }),
  trade({
    id: "c",
    pnl: -95,
    openedAt: dayStart("2026-09-01") + 9 * 3_600_000,
  }),
  trade({ id: "d", pnl: -15, overrode: true }),
  trade({ id: "e", pnl: 0 }),
  trade({ id: "f", pnl: 120 }),
  trade({ id: "g", pnl: 12, symbol: "ETH", direction: "short" }),
]

describe("losing patterns", () => {
  const lost = groupPatterns(trades, "lost")

  it("counts only the trades that lost, and never the one that broke even", () => {
    expect(lost.trades).toBe(4)
    expect(lost.total).toBe(-520)
  })

  it("every grouping's dollars add up to the period total", () => {
    for (const grouping of lost.groupings) {
      const sum = grouping.groups.reduce(
        (total, group) => total + group.dollars,
        0
      )
      expect(sum).toBeCloseTo(lost.total)
    }
  })

  it("puts the biggest loss first in each grouping", () => {
    const stop = lost.groupings.find((grouping) => grouping.kind === "stop")!
    expect(stop.groups[0]).toEqual({
      label: "No stop",
      trades: 2,
      dollars: -410,
    })
    const side = lost.groupings.find((grouping) => grouping.kind === "side")!
    expect(side.groups.map((group) => group.label)).toEqual(["Shorts", "Longs"])
    const hour = lost.groupings.find((grouping) => grouping.kind === "hour")!
    expect(hour.groups[0].label).toBe(hourLabel(22))
    expect(hour.groups[1]).toEqual({
      label: hourLabel(9),
      trades: 1,
      dollars: -95,
    })
  })
})

describe("winning patterns", () => {
  it("groups the trades that made money by coin", () => {
    const made = groupPatterns(trades, "made")
    expect(made.total).toBe(132)
    const coin = made.groupings.find((grouping) => grouping.kind === "coin")!
    expect(coin.groups).toEqual([
      { label: "BTC", trades: 1, dollars: 120 },
      { label: "ETH", trades: 1, dollars: 12 },
    ])
  })
})
