import { describe, expect, it } from "vitest"

import type { BacktestResult } from "@/lib/backtest/types"

import { buildRunFillMarkers, buildRunMarkers } from "./backtest-overlays"

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
  const trade = (over: Partial<BacktestResult["trades"][number]>) => ({
    n: 1,
    side: "long" as const,
    entryTime: 10,
    entryPx: 100,
    exitTime: 20,
    exitPx: 110,
    qty: 1,
    pnl: 10,
    returnPct: 10,
    cumPnl: 10,
    ...over,
  })

  it("colors chips by side: long green, short red, open O and close C", () => {
    const result = emptyResult({
      trades: [trade({})],
      openPosition: { side: "short", szi: -1, entryPx: 105, entryTime: 30 },
    })
    expect(buildRunMarkers(result)).toEqual([
      { time: 10, side: "buy", price: 100, letter: "O", color: "#089981" },
      { time: 20, side: "sell", price: 110, letter: "C", color: "#089981" },
      { time: 30, side: "sell", price: 105, letter: "O", color: "#f23645" },
    ])
  })

  it("collapses a reverse into one yellow flip chip", () => {
    // A long closes at t=20 and a short opens at the same instant → one "F".
    const result = emptyResult({
      trades: [
        trade({ n: 1, side: "long", entryTime: 10, exitTime: 20, exitPx: 110 }),
        trade({ n: 2, side: "short", entryTime: 20, entryPx: 110, exitTime: 30, exitPx: 105 }),
      ],
    })
    expect(buildRunMarkers(result)).toEqual([
      { time: 10, side: "buy", price: 100, letter: "O", color: "#089981" },
      { time: 20, side: "sell", price: 110, letter: "F", color: "#f5b301", textColor: "#1a1a1a" },
      { time: 30, side: "buy", price: 105, letter: "C", color: "#f23645" },
    ])
  })

  it("flips into a still-open position as one F, not a close + open", () => {
    // The last trade (long) closes at t=20 and the open short starts there.
    const result = emptyResult({
      trades: [trade({ side: "long", entryTime: 10, exitTime: 20, exitPx: 110 })],
      openPosition: { side: "short", szi: -1, entryPx: 110, entryTime: 20 },
    })
    expect(buildRunMarkers(result)).toEqual([
      { time: 10, side: "buy", price: 100, letter: "O", color: "#089981" },
      { time: 20, side: "sell", price: 110, letter: "F", color: "#f5b301", textColor: "#1a1a1a" },
    ])
  })
})

describe("buildRunFillMarkers", () => {
  it("draws one letterless arrow per fill — every ladder buy, not one blended entry", () => {
    // Two DCA buys at different prices, then a sell to close.
    const result = emptyResult({
      fills: [
        { t: 10, side: "buy", px: 100, sz: 1, fee: 0.1, closedPnl: 0, purpose: "dca:b:0" },
        { t: 20, side: "buy", px: 95, sz: 2, fee: 0.1, closedPnl: 0, purpose: "dca:b:1" },
        { t: 30, side: "sell", px: 110, sz: 3, fee: 0.1, closedPnl: 40, purpose: "dca:tp" },
      ],
    })
    // No letter → the chart renders these as its native green/red arrows, and
    // each individual fill shows (the averaged-down entry is not collapsed).
    expect(buildRunFillMarkers(result)).toEqual([
      { time: 10, side: "buy", price: 100 },
      { time: 20, side: "buy", price: 95 },
      { time: 30, side: "sell", price: 110 },
    ])
  })

  it("is empty when the run made no fills", () => {
    expect(buildRunFillMarkers(emptyResult())).toEqual([])
  })
})
