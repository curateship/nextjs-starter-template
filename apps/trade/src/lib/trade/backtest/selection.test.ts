import { describe, expect, it } from "vitest"

import { firstBacktestMarket } from "./selection"

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
})
