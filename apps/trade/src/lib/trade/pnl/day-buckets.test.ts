import { describe, expect, it } from "vitest"

import { bucketDays, monthTotal } from "@/lib/trade/pnl/day-buckets"
import { buildTradingOverviewProfit } from "@/lib/trade/dashboard/overview"
import { dayStart } from "@/lib/trade/pnl/periods"

const SINCE = dayStart("2026-08-20")
const fills = [
  { at: dayStart("2026-09-01") + 3_600_000, money: 40 },
  // 23:30 Toronto on 1 September, still that day though 03:30 UTC on the 2nd.
  { at: dayStart("2026-09-02") - 30 * 60_000, money: -8 },
  { at: dayStart("2026-09-02") + 60_000, money: null },
  { at: dayStart("2026-09-03"), money: 65 },
  // Before records begin: left out, as the graph leaves it out.
  { at: SINCE - 1, money: 999 },
]

describe("month grid days", () => {
  it("adds each day up on the Toronto clock and counts unpriced fills apart", () => {
    const days = bucketDays(
      fills,
      [{ closedAt: dayStart("2026-09-01") + 7_200_000 }],
      SINCE
    )
    expect(days.get("2026-09-01")).toEqual({
      day: "2026-09-01",
      money: 32,
      unpriced: 0,
      trades: 1,
    })
    expect(days.get("2026-09-02")).toEqual({
      day: "2026-09-02",
      money: 0,
      unpriced: 1,
      trades: 0,
    })
    expect(days.has("2026-08-19")).toBe(false)
  })

  it("sums to the PnL Graph's figure for the same month", () => {
    const days = bucketDays(fills, [], SINCE)
    const graph = buildTradingOverviewProfit(
      fills,
      SINCE,
      0,
      dayStart("2026-10-01")
    )
    expect(monthTotal(days, "2026-09").money).toBeCloseTo(graph.at(-1)!.money)
    expect(monthTotal(days, "2026-09")).toEqual({
      money: 97,
      trades: 0,
      unpriced: 1,
    })
  })
})
