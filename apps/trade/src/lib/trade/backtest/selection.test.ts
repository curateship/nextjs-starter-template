import { describe, expect, it } from "vitest"

import type { BacktestTrade } from "@/lib/trade/backtest/result"

import { firstBacktestMarket, firstBacktestTrade } from "./selection"

describe("backtest chart selection", () => {
  it("starts with the first market in the Results panel's default order", () => {
    expect(
      firstBacktestMarket([
        { marketKey: "skipped", summary: null },
        { marketKey: "no-trades", summary: { madeOrLost: 0, trades: 0 } },
        { marketKey: "loser", summary: { madeOrLost: -10, trades: 2 } },
        { marketKey: "winner", summary: { madeOrLost: 25, trades: 3 } },
      ])
    ).toBe("winner")
  })

  it("starts with the first closed trade shown in the Trades panel", () => {
    const trade = (n: number, exitAt: number | null) =>
      ({ n, exitAt } as BacktestTrade)

    expect(
      firstBacktestTrade([trade(3, 300), trade(1, null), trade(2, 200)])
    ).toBe(2)
    expect(firstBacktestTrade([trade(1, null)])).toBe(1)
    expect(firstBacktestTrade([])).toBeNull()
  })
})
