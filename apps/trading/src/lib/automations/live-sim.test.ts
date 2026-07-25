import { describe, expect, it } from "vitest"

import { compileAutomationGraph, type AutomationConfig } from "./automation"
import { DEFAULT_DCA_RUNGS } from "./dca"
import { simulateAutomation, type LiveSimCandle } from "./live-sim"

// Small base window so the warmup (base periods + pump + history) stays short
// enough to hand-build a candle series past it.
function dcaConfig(): AutomationConfig {
  const result = compileAutomationGraph({
    interval: "1h",
    graph: {
      nodes: [
        {
          id: "base",
          kind: "indicator",
          x: 0,
          y: 0,
          indicator: {
            type: "base",
            params: { basePeriods: 5, pumpPeriods: 2, crackPct: 2.5 },
          },
        },
        {
          id: "dca",
          kind: "dca",
          rungs: DEFAULT_DCA_RUNGS.map((rung) => ({ ...rung })),
          maxPositionPct: 25,
          sizeMultiplier: 2,
          compound: true,
          rungEntry: "market",
          requireTwoGreen: false,
          crackPct: 2.5,
          maxCrackBars: 4,
          respectFilterEnabled: false,
          respectLookbackMonths: 6,
          minRespectPct: 80,
          recoveryTargetPct: -2,
          x: 0,
          y: 0,
        },
        { id: "tp", kind: "takeProfit", pct: 3, x: 0, y: 0 },
        { id: "sl", kind: "stopLoss", pct: 8, x: 0, y: 0 },
      ],
      edges: [
        { id: "e1", from: "base", sourcePort: "bullish", to: "dca" },
        { id: "e2", from: "dca", sourcePort: "tp", to: "tp" },
        { id: "e3", from: "dca", sourcePort: "sl", to: "sl" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  })
  if (!result.config) {
    throw new Error(`config failed: ${JSON.stringify(result.errors)}`)
  }
  return result.config
}

const HOUR = 3_600_000
const T0 = 1_700_000_000_000

function bar(
  t: number,
  o: number,
  h: number,
  l: number,
  c: number
): LiveSimCandle {
  return { t, o, h, l, c, v: 1000 }
}

/**
 * Candle history that confirms a base at 100. qflBase marks a base only when a
 * FRESH lower low appears and holds while the prior window sat higher — so a
 * higher floor (102) first, then a drop to 100 that holds, then price back above
 * the base. The 100 base then carries forward through warmup until the tail.
 */
function withBaseHistory(tail: LiveSimCandle[]): LiveSimCandle[] {
  const candles: LiveSimCandle[] = []
  let t = T0
  const push = (o: number, h: number, l: number, c: number) => {
    candles.push(bar(t, o, h, l, c))
    t += HOUR
  }
  // Higher floor at 102 — the "prior" window that was higher.
  for (let i = 0; i < 10; i += 1) push(102.5, 103, 102, 102.5)
  // A fresh lower low at 100 that holds → qflBase confirms base = 100.
  for (let i = 0; i < 4; i += 1) push(100.5, 101, 100, 100.5)
  // Oscillate ABOVE the base (lows 101) so no new base forms and 100 carries
  // forward well past the strategy's warmup.
  for (let i = 0; i < 50; i += 1) push(101.5, 102, 101, 101.5)
  for (const candle of tail) {
    candles.push({ ...candle, t })
    t += HOUR
  }
  return candles
}

describe("simulateAutomation", () => {
  it("cracks the base, fills a ladder rung, then sells at take-profit", () => {
    const candles = withBaseHistory([
      // Crack: close 96 is below base(100) − 2.5% = 97.5.
      bar(0, 100, 100, 96, 96),
      // Dip to 94: the first rung rests at 100 − 5% = 95, so it fills here.
      bar(0, 96, 96, 94, 95),
      // Recovery: high 98.5 clears TP at avg(95) + 3% = 97.85 → sell.
      bar(0, 95, 98.5, 95, 98.5),
      bar(0, 98.5, 99, 98, 98.5),
    ])

    const result = simulateAutomation({
      config: dcaConfig(),
      candles,
      market: "TEST",
      interval: "1h",
    })

    expect(result).not.toBeNull()
    const buys = result!.fills.filter((fill) => fill.side === "buy")
    const sells = result!.fills.filter((fill) => fill.side === "sell")
    // A ladder buy near 95 and a take-profit sell near 97.85.
    expect(buys.length).toBeGreaterThan(0)
    expect(buys[0].px).toBeGreaterThan(90)
    expect(buys[0].px).toBeLessThan(97)
    expect(sells.length).toBeGreaterThan(0)
    // One completed long round trip, flat at the end.
    expect(result!.trades.length).toBeGreaterThan(0)
    expect(result!.trades[0].side).toBe("long")
    expect(result!.openPosition).toBeNull()
  })

  it("holds an open long when the ladder filled but TP was never reached", () => {
    const candles = withBaseHistory([
      bar(0, 100, 100, 96, 96), // crack
      bar(0, 96, 96, 94, 95), // rung fills ~95
      bar(0, 95, 95.5, 94.5, 95), // no recovery to TP
    ])

    const result = simulateAutomation({
      config: dcaConfig(),
      candles,
      market: "TEST",
      interval: "1h",
    })

    expect(result).not.toBeNull()
    expect(result!.fills.some((fill) => fill.side === "buy")).toBe(true)
    expect(result!.fills.some((fill) => fill.side === "sell")).toBe(false)
    expect(result!.openPosition?.side).toBe("long")
  })

  it("does nothing when the base never cracks", () => {
    // Flat, then a gentle rise — price never closes below the base threshold.
    const candles = withBaseHistory([
      bar(0, 100.5, 102, 100, 101),
      bar(0, 101, 103, 100.5, 102),
      bar(0, 102, 104, 101.5, 103),
    ])

    const result = simulateAutomation({
      config: dcaConfig(),
      candles,
      market: "TEST",
      interval: "1h",
    })

    expect(result).not.toBeNull()
    expect(result!.fills.length).toBe(0)
    expect(result!.trades.length).toBe(0)
    expect(result!.openPosition).toBeNull()
  })

  it("returns null when there aren't enough candles to warm up", () => {
    const result = simulateAutomation({
      config: dcaConfig(),
      candles: [bar(T0, 100, 101, 100, 100), bar(T0 + HOUR, 100, 101, 100, 100)],
      market: "TEST",
      interval: "1h",
    })
    expect(result).toBeNull()
  })
})
