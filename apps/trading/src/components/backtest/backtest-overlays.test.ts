import { describe, expect, it } from "vitest"

import type { BacktestResult } from "@/lib/backtest/types"

import { buildRunMarkers } from "./backtest-overlays"

function emptyResult(partial: Partial<BacktestResult> = {}): BacktestResult {
  return {
    equityCurve: [],
    trades: [],
    fills: [],
    openPosition: null,
    stats: {} as BacktestResult["stats"],
    ...partial,
  }
}

describe("buildRunMarkers", () => {
  it("emits entry and exit markers per round trip plus the open position", () => {
    const result = emptyResult({
      trades: [
        {
          n: 1,
          side: "long",
          entryTime: 10,
          entryPx: 100,
          exitTime: 20,
          exitPx: 110,
          qty: 1,
          pnl: 10,
          returnPct: 10,
          cumPnl: 10,
        },
      ],
      openPosition: { side: "short", szi: -1, entryPx: 105, entryTime: 30 },
    })
    expect(buildRunMarkers(result)).toEqual([
      { time: 10, side: "buy", price: 100, letter: "O", color: "#089981" },
      { time: 20, side: "sell", price: 110, letter: "C", color: "#f23645" },
      { time: 30, side: "sell", price: 105, letter: "O", color: "#089981" },
    ])
  })
})
