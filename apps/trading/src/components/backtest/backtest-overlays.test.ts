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
        { t: 30, side: "sell", px: 110, sz: 3, fee: 0.1, closedPnl: 40, purpose: "dca:s:all" },
      ],
    })
    // No letter → the chart renders these as its native green/red arrows, and
    // each individual fill shows (the averaged-down entry is not collapsed).
    // Each also carries which rung it was and how much it filled, so hovering
    // the candle can tell several identical-looking arrows apart.
    expect(buildRunFillMarkers(result)).toEqual([
      { time: 10, side: "buy", price: 100, label: "Rung 1", value: 100 },
      { time: 20, side: "buy", price: 95, label: "Rung 2", value: 190 },
      { time: 30, side: "sell", price: 110, label: "Sell all 2 rungs", value: 330 },
    ])
  })

  it("names the plain exit in words, not as its internal code", () => {
    const result = emptyResult({
      fills: [
        { t: 40, side: "sell", px: 90, sz: 2, fee: 0.1, closedPnl: -20, purpose: "dca:exit" },
      ],
    })
    // Nothing was tracked as open, so it can't claim a count — but it still
    // must not print "dca:exit".
    expect(buildRunFillMarkers(result)[0].label).toBe("Exit")
  })

  it("says how much of the ladder an exit closed", () => {
    const result = emptyResult({
      fills: [
        { t: 10, side: "buy", px: 100, sz: 1, fee: 0, closedPnl: 0, purpose: "dca:b:0" },
        { t: 20, side: "buy", px: 91, sz: 2, fee: 0, closedPnl: 0, purpose: "dca:b:1" },
        { t: 30, side: "buy", px: 80, sz: 4, fee: 0, closedPnl: 0, purpose: "dca:b:2" },
        { t: 40, side: "sell", px: 73.4, sz: 7, fee: 0, closedPnl: -60, purpose: "dca:exit" },
      ],
    })
    expect(buildRunFillMarkers(result)[3].label).toBe("Exit all 3 rungs")
  })

  it("counts rungs, not fills, when one rung fills in pieces", () => {
    // Rung 1 fills twice. The ladder took two steps, not three.
    const result = emptyResult({
      fills: [
        { t: 10, side: "buy", px: 100, sz: 1, fee: 0, closedPnl: 0, purpose: "dca:b:0" },
        { t: 15, side: "buy", px: 100, sz: 1, fee: 0, closedPnl: 0, purpose: "dca:b:0" },
        { t: 20, side: "buy", px: 91, sz: 2, fee: 0, closedPnl: 0, purpose: "dca:b:1" },
        { t: 30, side: "sell", px: 73.4, sz: 4, fee: 0, closedPnl: -50, purpose: "dca:exit" },
      ],
    })
    expect(buildRunFillMarkers(result)[3].label).toBe("Exit all 2 rungs")
  })

  it("says which rung an exit sold at, when it sold at one", () => {
    // The ladder rests the whole position for sale at the step above its
    // deepest buy — here rung 2's price — so the exit names that rung.
    const result = emptyResult({
      fills: [
        { t: 10, side: "buy", px: 100, sz: 1, fee: 0, closedPnl: 0, purpose: "dca:b:0" },
        { t: 20, side: "buy", px: 91, sz: 2, fee: 0, closedPnl: 0, purpose: "dca:b:1" },
        { t: 30, side: "buy", px: 80, sz: 4, fee: 0, closedPnl: 0, purpose: "dca:b:2" },
        { t: 40, side: "sell", px: 91, sz: 7, fee: 0, closedPnl: 20, purpose: "dca:s:all" },
      ],
    })
    expect(buildRunFillMarkers(result)[3].label).toBe(
      "Sell all 3 rungs at Rung 2"
    )
  })

  it("does not invent a rung for an exit that landed nowhere near one", () => {
    // A stop-out fills wherever price was, not at a ladder step. It can still
    // say how much it closed — it just must not name a rung it didn't sell at.
    const result = emptyResult({
      fills: [
        { t: 10, side: "buy", px: 100, sz: 1, fee: 0, closedPnl: 0, purpose: "dca:b:0" },
        { t: 20, side: "sell", px: 73.4, sz: 1, fee: 0, closedPnl: -27, purpose: "dca:exit" },
      ],
    })
    const label = buildRunFillMarkers(result)[1].label
    expect(label).toBe("Exit all 1 rung")
    expect(label).not.toContain("at Rung")
  })

  it("does not carry rungs across a closed cycle", () => {
    // After a sell the position is flat; the next cycle's exit must not match
    // against the previous cycle's buys.
    const result = emptyResult({
      fills: [
        { t: 10, side: "buy", px: 100, sz: 1, fee: 0, closedPnl: 0, purpose: "dca:b:0" },
        { t: 20, side: "sell", px: 100, sz: 1, fee: 0, closedPnl: 0, purpose: "dca:s:all" },
        { t: 30, side: "sell", px: 100, sz: 1, fee: 0, closedPnl: 0, purpose: "dca:exit" },
      ],
    })
    expect(buildRunFillMarkers(result)[2].label).toBe("Exit")
  })

  it("labels a whole-position exit as such", () => {
    const result = emptyResult({
      fills: [
        { t: 40, side: "sell", px: 120, sz: 5, fee: 0.1, closedPnl: 9, purpose: "dca:s:all" },
      ],
    })
    expect(buildRunFillMarkers(result)[0].label).toBe("Sell all")
  })

  it("is empty when the run made no fills", () => {
    expect(buildRunFillMarkers(emptyResult())).toEqual([])
  })
})
