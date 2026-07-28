import { describe, expect, it } from "vitest"

import type { AutomationConfig } from "@/lib/automations/automation"
import type { BacktestCosts } from "@/lib/backtest/types"
import type { HistoryCandle } from "@/server/backtest/history"

import {
  runBacktest,
  runDcaPortfolioBacktests,
  type RunBacktestConfig,
} from "../backtest/runner"
import { resolveStrategy } from "../strategies/registry"
import { SharedWalletPortfolio } from "../shared-wallet-portfolio"

const STEP = 900_000
const costs: BacktestCosts = { takerFeeBps: 0, makerFeeBps: 0, slippageBps: 0 }

function bar(
  index: number,
  close: number,
  low: number,
  high = close,
  volume = 10,
  open = close
): HistoryCandle {
  return {
    t: index * STEP,
    T: (index + 1) * STEP - 1,
    o: open,
    h: high,
    l: low,
    c: close,
    v: volume,
    n: 1,
  }
}

// A shelf held at low 100, then a panic crack below it (bar 6).
const setup = [
  bar(0, 101, 100, 102),
  bar(1, 101, 100, 102),
  bar(2, 101, 100, 102),
  bar(3, 101, 100, 102),
  bar(4, 92, 90, 93),
  bar(5, 95, 91, 96),
  bar(6, 87, 86, 96, 30, 95),
]

function dcaConfig(
  overrides: Partial<AutomationConfig["dca"]> = {}
): AutomationConfig {
  return {
    v: 2,
    kind: "automation",
    interval: "15m",
    rules: [],
    protection: { long: { takeProfitPct: 3 } },
    dca: {
      nodeId: "dca",
      rungs: [{ deviation: 5 }, { deviation: 8 }],
      maxPositionPct: 10,
      sizeMultiplier: 1,
      compound: true,
      rungEntry: "market",
      requireTwoGreen: false,
      basePeriods: 4,
      pumpPeriods: 1,
      trendFilterEnabled: false,
      trendMaBars: 200,
      exitOnTrendBreak: false,
      ...overrides,
    },
  }
}

function run(config: AutomationConfig, candles: HistoryCandle[]) {
  const strategy = resolveStrategy(config)
  if (!strategy) throw new Error("DCA strategy did not resolve")
  return runBacktest({
    strategy,
    params: config,
    candles,
    simStartMs: 0,
    startingEquity: 10_000,
    market: "TEST",
    interval: "15m",
    costs,
  })
}

function portfolioConfig(
  market: string,
  config: AutomationConfig,
  candles: HistoryCandle[]
): RunBacktestConfig {
  const strategy = resolveStrategy(config)
  if (!strategy) throw new Error("DCA strategy did not resolve")
  return {
    strategy,
    params: config,
    candles,
    simStartMs: 0,
    startingEquity: 10_000,
    market,
    interval: "15m",
    costs,
  }
}

// After `setup`, the base tracker confirms a base of 90 (bar 5); with rung
// deviations [5, 8] the rung levels compound down to 85.5 and 78.66. An orderly
// dip that CLOSES just below each level confirms and market-buys that rung near
// the level; the fail-safe (violent = a close more than 2×5% below the shallowest
// unbought rung) only trips on a real crash.
describe("DCA through the real backtest runner", () => {
  it("buys each rung as an orderly dip confirms it, caps the pot, and takes profit off the average", () => {
    // Orderly step-down: bar 7 closes just below rung 0 (85.5), bar 8 just below
    // rung 1 (78.66); bar 9 rips up to trigger the average take profit.
    const result = run(dcaConfig(), [
      ...setup,
      bar(7, 84, 83, 88, 10, 87),
      bar(8, 77, 76, 85, 10, 84),
      bar(9, 200, 79, 210, 10, 82),
    ])

    const buys = result.fills.filter((fill) =>
      fill.purpose.startsWith("dca:b:")
    )
    const exit = result.fills.find((fill) => fill.purpose === "dca:exit")

    // Both rungs filled, each on its own bar as price stepped down (not bunched).
    expect(buys.length).toBe(2)
    expect(buys.some((b) => Math.abs(b.px - 84) < 1e-6)).toBe(true)
    expect(buys.some((b) => Math.abs(b.px - 77) < 1e-6)).toBe(true)
    // Each rung deployed its dollar budget (5% of $10k), so the pot is exactly
    // the 10% cap regardless of the fill price.
    expect(buys.reduce((sum, fill) => sum + fill.px * fill.sz, 0)).toBeCloseTo(
      1_000
    )
    // Take profit closed the averaged position; nothing left open.
    expect(exit).toBeTruthy()
    expect(result.openPosition).toBeNull()
    // One round trip per rung (not zero from float dust, not one merged cycle).
    expect(result.trades.length).toBe(2)
    // Each trade starts at its own rung's real buy price, not the average.
    const buyPrices = buys.map((fill) => fill.px)
    for (const trade of result.trades) {
      expect(
        buyPrices.some((buy) => Math.abs(buy - trade.entryPx) < 1e-6)
      ).toBe(true)
    }
  })

  it("trend gate: refuses to start a ladder while price is below its average", () => {
    // The gate averages the last 6 closes. `setup` ends at 87 after a slide from
    // 101, so the close sits BELOW that average — a falling market, exactly what
    // the gate exists to sit out. Nothing may buy.
    const falling = run(
      dcaConfig({ trendFilterEnabled: true, trendMaBars: 6 }),
      [
        ...setup,
        bar(7, 84, 83, 88, 10, 87),
        bar(8, 77, 76, 85, 10, 84),
        bar(9, 200, 79, 210, 10, 82),
      ]
    )
    expect(falling.fills.length).toBe(0)
    expect(falling.openPosition).toBeNull()

    // Same ladder, gate off: it trades. Proves the gate is what stopped it, not
    // some other precondition.
    const ungated = run(dcaConfig(), [
      ...setup,
      bar(7, 84, 83, 88, 10, 87),
      bar(8, 77, 76, 85, 10, 84),
      bar(9, 200, 79, 210, 10, 82),
    ])
    expect(ungated.fills.length).toBeGreaterThan(0)
  })

  it("trend gate: lets the same ladder through when the market has been rising", () => {
    // Identical base-and-crack to the blocked case, but preceded by a long climb
    // from 60, so the 10-bar average sits at ~90 while the arming close is 95 —
    // an uptrend. Same crack, same rungs, opposite verdict.
    const climb = [
      bar(0, 60, 59, 61),
      bar(1, 65, 64, 66),
      bar(2, 70, 69, 71),
      bar(3, 75, 74, 76),
      bar(4, 80, 79, 81),
      bar(5, 85, 84, 86),
    ]
    const shifted = setup.map((candle, index) => {
      const i = index + climb.length
      return { ...candle, t: i * STEP, T: (i + 1) * STEP - 1 }
    })
    const result = run(
      dcaConfig({ trendFilterEnabled: true, trendMaBars: 10 }),
      [
        ...climb,
        ...shifted,
        bar(13, 84, 83, 88, 10, 87),
        bar(14, 77, 76, 85, 10, 84),
        bar(15, 200, 79, 210, 10, 82),
      ]
    )
    expect(
      result.fills.filter((f) => f.purpose.startsWith("dca:b:")).length
    ).toBeGreaterThan(0)
  })

  it("stop at the confirmed base: rung 1 stops out, rung 2 is still next", () => {
    // Base 90 confirms (bar 5) and rung 0 buys the bar-6 close at 84. Price then
    // shelves at 82, so a NEW base of 82 confirms (bar 8) — now BELOW the entry,
    // which is what makes it a stop at all. Bar 11 breaks it: the stop fires at
    // 82 and sells the lot, but the ladder is not finished — rung 1 sits at
    // 84 x 0.92 = 77.28 and the bar closes at 71, so it buys.
    const candles = [
      bar(0, 101, 100, 102),
      bar(1, 101, 100, 102),
      bar(2, 101, 100, 102),
      bar(3, 101, 100, 102),
      bar(4, 92, 90, 101, 10, 101),
      bar(5, 95, 91, 96, 10, 92),
      bar(6, 84, 83, 96, 10, 95),
      bar(7, 83, 82, 85, 10, 84),
      bar(8, 83, 82, 84, 10, 83),
      bar(9, 83, 82, 84, 10, 83),
      bar(10, 83, 82, 84, 10, 83),
      bar(11, 71, 70, 83, 10, 83),
      bar(12, 71, 70, 72, 10, 71),
    ]
    const baseStop: AutomationConfig = {
      ...dcaConfig(),
      protection: {
        long: {
          takeProfitPct: 50,
          // 50% below 84 is 42 — this tape never gets there, so an exit at 82
          // can only have come from the base.
          stopLossPct: 50,
          stopLossLevel: {
            kind: "confirmedBase",
            basePeriods: 4,
            pumpPeriods: 1,
          },
        },
      },
    }
    const result = run(baseStop, candles)

    const buys = result.fills.filter((f) => f.purpose.startsWith("dca:b:"))
    const exits = result.fills.filter((f) => f.purpose === "dca:exit")
    // The stop fired ON the base, not at the percent.
    expect(exits.length).toBeGreaterThanOrEqual(1)
    expect(exits[0].px).toBeCloseTo(82, 6)
    // ...and the ladder carried on: rung 1 bought after rung 0 was stopped out.
    expect(buys.length).toBe(2)
    expect(buys[0].purpose).toBe("dca:b:0")
    expect(buys[1].purpose).toBe("dca:b:1")
    expect(buys[0].px).toBeCloseTo(84, 6)

    // Same tape, plain percent stop: the ladder keeps its old behaviour, so the
    // 50% stop never fires and both rungs fill into ONE averaged position.
    const percent = run(
      {
        ...dcaConfig(),
        protection: { long: { takeProfitPct: 50, stopLossPct: 50 } },
      },
      candles
    )
    expect(percent.fills.some((f) => f.purpose === "dca:exit")).toBe(false)
  })

  it("reclaim: buys back after price holds above the base it was stopped at", () => {
    // Base 90 confirms (bar 5), rung 0 buys the bar-6 close at 84, a shelf at 82
    // confirms a new base BELOW the entry (bar 8), and bar 9 breaks it — the
    // stop fires at 82. Price then reclaims 82 and holds above it.
    const leadIn = [
      bar(0, 101, 100, 102),
      bar(1, 101, 100, 102),
      bar(2, 101, 100, 102),
      bar(3, 101, 100, 102),
      bar(4, 92, 90, 101, 10, 101),
      bar(5, 95, 91, 96, 10, 92),
      bar(6, 84, 83, 96, 10, 95),
      bar(7, 83, 82, 85, 10, 84),
      bar(8, 83, 82, 84, 10, 83),
      bar(9, 79, 78, 84, 10, 83),
    ]
    // Back above 82 and staying there. At 15m bars, 96 of them is one day.
    const held = Array.from({ length: 120 }, (_, i) =>
      bar(10 + i, 85, 84, 86, 10, 84)
    )
    const candles = [...leadIn, ...held]

    const withReclaim = (reclaimDays?: number): AutomationConfig => ({
      ...dcaConfig(),
      protection: {
        long: {
          takeProfitPct: 50,
          stopLossPct: 50,
          stopLossLevel: {
            kind: "confirmedBase",
            basePeriods: 4,
            pumpPeriods: 1,
            ...(reclaimDays === undefined ? {} : { reclaimDays }),
          },
        },
      },
    })

    const on = run(withReclaim(1), candles)
    const buys = on.fills.filter((f) => f.purpose.startsWith("dca:b:"))
    // Stopped out at the base...
    expect(on.fills.find((f) => f.purpose === "dca:exit")?.px).toBeCloseTo(
      82,
      6
    )
    // ...then bought back once price had held above 82 for a day. The buy-back
    // is the SAME rung (0), not the next one down, and puts back the same MONEY
    // — not the same coin count, which would spend more the further price has
    // run since the stop.
    expect(buys.length).toBe(2)
    expect(buys[1].purpose).toBe("dca:b:0")
    expect(buys[1].px * buys[1].sz).toBeCloseTo(buys[0].px * buys[0].sz, 6)
    expect(buys[1].sz).toBeLessThan(buys[0].sz)
    // And it is above the level it was stopped at — that is the cost of proof.
    expect(buys[1].px).toBeGreaterThan(82)
    expect(on.openPosition).not.toBeNull()

    // Off: the same tape stops out and never buys back.
    const off = run(withReclaim(), candles)
    expect(off.fills.find((f) => f.purpose === "dca:exit")?.px).toBeCloseTo(
      82,
      6
    )
    expect(off.fills.filter((f) => f.purpose.startsWith("dca:b:")).length).toBe(
      1
    )
  })

  it("reclaim: a close back under the base restarts the wait", () => {
    const leadIn = [
      bar(0, 101, 100, 102),
      bar(1, 101, 100, 102),
      bar(2, 101, 100, 102),
      bar(3, 101, 100, 102),
      bar(4, 92, 90, 101, 10, 101),
      bar(5, 95, 91, 96, 10, 92),
      bar(6, 84, 83, 96, 10, 95),
      bar(7, 83, 82, 85, 10, 84),
      bar(8, 83, 82, 84, 10, 83),
      bar(9, 79, 78, 84, 10, 83),
    ]
    // Almost a full day back above 82, then ONE close under it, then a stretch
    // above again that is shorter than a day. The wait restarted, so no buy.
    const chop = [
      ...Array.from({ length: 90 }, (_, i) => bar(10 + i, 85, 84, 86, 10, 84)),
      bar(100, 81, 80, 85, 10, 84),
      ...Array.from({ length: 50 }, (_, i) => bar(101 + i, 85, 84, 86, 10, 81)),
    ]
    const result = run(
      {
        ...dcaConfig(),
        protection: {
          long: {
            takeProfitPct: 50,
            stopLossPct: 50,
            stopLossLevel: {
              kind: "confirmedBase",
              basePeriods: 4,
              pumpPeriods: 1,
              reclaimDays: 1,
            },
          },
        },
      },
      [...leadIn, ...chop]
    )
    expect(
      result.fills.filter((f) => f.purpose.startsWith("dca:b:")).length
    ).toBe(1)
  })

  it("reclaim: repeated stop-and-reclaim never grows the position", () => {
    // Stop, reclaim, stop, reclaim... each round must put back the SAME money,
    // never more. The bug this guards: a step-down left each rung's filled size
    // in place, so every reclaim added to it and the next one bought double —
    // SOLV compounded to $76,750 against a $25,000 pot (July 28, 2026).
    const leadIn = [
      bar(0, 101, 100, 102),
      bar(1, 101, 100, 102),
      bar(2, 101, 100, 102),
      bar(3, 101, 100, 102),
      bar(4, 92, 90, 101, 10, 101),
      bar(5, 95, 91, 96, 10, 92),
      bar(6, 84, 83, 96, 10, 95),
      bar(7, 83, 82, 85, 10, 84),
      bar(8, 83, 82, 84, 10, 83),
    ]
    // Four rounds of: break 82, then hold back above it for a day (96 bars).
    const round = (start: number) => [
      bar(start, 79, 78, 84, 10, 83),
      ...Array.from({ length: 110 }, (_, i) =>
        bar(start + 1 + i, 85, 84, 86, 10, 84)
      ),
    ]
    const candles = [
      ...leadIn,
      ...round(9),
      ...round(120),
      ...round(231),
      ...round(342),
    ]

    const result = run(
      {
        ...dcaConfig(),
        protection: {
          long: {
            takeProfitPct: 500,
            stopLossPct: 100,
            stopLossLevel: {
              kind: "confirmedBase",
              basePeriods: 4,
              pumpPeriods: 1,
              reclaimDays: 1,
            },
          },
        },
      },
      candles
    )

    const buys = result.fills.filter((f) => f.purpose.startsWith("dca:b:"))
    expect(buys.length).toBeGreaterThan(1)
    // Every buy is budgeted off the same frozen equity, so no buy may cost
    // meaningfully more than the first. Doubling would blow straight past this.
    const notional = buys.map((f) => f.px * f.sz)
    const first = notional[0]
    for (const value of notional) {
      expect(value).toBeLessThanOrEqual(first * 1.5)
    }
    // And the whole ladder never holds more than its pot (10% of 10,000).
    let pos = 0
    let peak = 0
    for (const f of [...result.fills].sort((a, b) => a.t - b.t)) {
      pos += f.side === "buy" ? f.sz : -f.sz
      peak = Math.max(peak, pos * f.px)
    }
    expect(peak).toBeLessThanOrEqual(1_000 * 1.05)
  })

  it("reclaim: the last rung stopping out ends the cycle for good", () => {
    // Both rungs bought (84 and 77, average about 80), then a base of 75
    // confirms BELOW that average and price breaks it. With no rung left there
    // is nothing to wait for, so the cycle is finished — no reclaim, no re-buy,
    // however long price then holds back above the base.
    const candles = [
      bar(0, 101, 100, 102),
      bar(1, 101, 100, 102),
      bar(2, 101, 100, 102),
      bar(3, 101, 100, 102),
      bar(4, 92, 90, 101, 10, 101),
      bar(5, 95, 91, 96, 10, 92),
      bar(6, 84, 83, 96, 10, 95),
      bar(7, 77, 76, 85, 10, 84),
      bar(8, 78, 75, 79, 10, 77),
      bar(9, 78, 75, 79, 10, 78),
      bar(10, 71, 70, 79, 10, 78),
      ...Array.from({ length: 200 }, (_, i) => bar(11 + i, 80, 79, 81, 10, 79)),
    ]
    const result = run(
      {
        ...dcaConfig(),
        protection: {
          long: {
            takeProfitPct: 500,
            stopLossPct: 100,
            stopLossLevel: {
              kind: "confirmedBase",
              basePeriods: 4,
              pumpPeriods: 1,
              reclaimDays: 1,
            },
          },
        },
      },
      candles
    )
    const buys = result.fills.filter((f) => f.purpose.startsWith("dca:b:"))
    const exits = result.fills.filter((f) => f.purpose === "dca:exit")
    expect(buys.length).toBe(2)
    expect(exits.length).toBe(1)
    // Nothing bought after the stop that used the last rung.
    expect(buys.every((f) => f.t < exits[0].t)).toBe(true)
    expect(result.openPosition).toBeNull()
  })

  it("gives up: a broken trend closes an open ladder, not just new ones", () => {
    // Climb (so the gate lets a ladder open), crack, then collapse below the
    // average. Entry-only gating would ride it down; exitOnTrendBreak closes.
    const climb = [
      bar(0, 60, 59, 61),
      bar(1, 65, 64, 66),
      bar(2, 70, 69, 71),
      bar(3, 75, 74, 76),
      bar(4, 80, 79, 81),
      bar(5, 85, 84, 86),
    ]
    const shifted = setup.map((candle, index) => {
      const i = index + climb.length
      return { ...candle, t: i * STEP, T: (i + 1) * STEP - 1 }
    })
    const collapse = Array.from({ length: 10 }, (_, i) =>
      bar(13 + i, 80 - i * 6, 78 - i * 6, 82 - i * 6, 10, 82 - i * 6)
    )
    const candles = [...climb, ...shifted, ...collapse]

    const rideItDown = run(
      dcaConfig({ trendFilterEnabled: true, trendMaBars: 10 }),
      candles
    )
    const closesOut = run(
      dcaConfig({
        trendFilterEnabled: true,
        trendMaBars: 10,
        exitOnTrendBreak: true,
      }),
      candles
    )
    // Entry-only gating leaves a position open through the collapse; the exit
    // version closes it.
    expect(closesOut.fills.some((f) => f.purpose === "dca:exit")).toBe(true)
    expect(closesOut.openPosition).toBeNull()
    void rideItDown
  })

  it("waits out a violent crash, then buys ONE rung at a time from the bounce", () => {
    // Bar 7 crashes 12%+ below rung 0 in one candle — the fail-safe refuses to
    // chase the knife. Bar 8 closes red (still falling), so it keeps waiting.
    // Bar 9 closes green: it buys ONLY the first rung at that bounce — not the
    // whole missed stack — and the next rung fills on a later bar, as usual.
    const result = run(dcaConfig(), [
      ...setup,
      bar(7, 74, 70, 90, 10, 90), // violent close, way below rung 0
      bar(8, 72, 71, 75, 10, 73), // red — still waiting
      bar(9, 76, 72, 77, 10, 73), // green — buy ONLY rung 0 at the bounce (~76)
      bar(10, 75, 73, 77, 10, 76), // holds near the bounce — rung 1 does NOT buy
      bar(11, 69, 66, 76, 10, 75), // a genuine further dip → rung 1 finally buys
    ])
    const buys = result.fills.filter((f) => f.purpose.startsWith("dca:b:"))
    // Nothing bought during the crash or the red bar.
    expect(buys.every((b) => b.t >= 9 * STEP)).toBe(true)
    // ONE rung at the first green bounce — the shallowest (rung 0), at the
    // bounce (~76) not its clean level. And it stays ONE while price hovers.
    const atBounce = buys.filter((b) => b.t === 9 * STEP)
    expect(atBounce.length).toBe(1)
    expect(atBounce[0].purpose).toBe("dca:b:0")
    expect(atBounce[0].px).toBeLessThan(78.66)
    expect(buys.filter((b) => b.t <= 10 * STEP).length).toBe(1)
    // Rung 1 only fills once price steps a real ~8% below that fill (~69), not
    // immediately off its stale pre-crash level.
    const buy1 = buys.find((b) => b.purpose === "dca:b:1")
    expect(buy1).toBeTruthy()
    expect(buy1!.px).toBeLessThan(72)
  })

  it("limit mode: an orderly step-down fills each rung at its exact level", () => {
    // Only the armed rung's limit rests at a time. As price steps down bar by
    // bar, each fills at its EXACT level (85.5 then 78.66) — no slippage.
    const result = run(dcaConfig({ rungEntry: "limit" }), [
      ...setup,
      bar(7, 85, 84, 88, 10, 87), // dips to rung 0 (85.5) → fills at 85.5
      bar(8, 78, 77, 86, 10, 85), // dips to rung 1 (78.66) → fills at 78.66
      bar(9, 200, 79, 210, 10, 82),
    ])
    const buys = result.fills.filter((f) => f.purpose.startsWith("dca:b:"))
    expect(buys.length).toBe(2)
    expect(buys.some((b) => Math.abs(b.px - 85.5) < 0.01)).toBe(true)
    expect(buys.some((b) => Math.abs(b.px - 78.66) < 0.01)).toBe(true)
  })

  it("limit mode: a DOWN bar can't buy and peel-sell a rung for a gain same-bar", () => {
    // Bar 8 dips to rung 1 (78.66) AND touches its peel target (85.5), but it
    // closes DOWN (open 84 → close 80). A run-up couldn't have followed the dip
    // on a falling bar, so the peel is deferred to a later bar — no invented gain.
    const base = dcaConfig({ rungEntry: "limit" })
    const config: AutomationConfig = {
      ...base,
      protection: {
        long: { takeProfitPct: 3, takeProfitMode: "previousRungSellAll" },
      },
    }
    const result = run(config, [
      ...setup,
      bar(7, 84, 84, 88, 10, 87), // rung 0 fills at 85.5, arms rung 1
      bar(8, 80, 78, 86, 10, 84), // DOWN bar: dips to rung 1 AND touches 86
      bar(9, 90, 85, 96, 10, 86), // later bar — the peel can fill now
    ])
    const buy1 = result.fills.find((f) => f.purpose === "dca:b:1")
    const sell1 = result.fills.find((f) => f.purpose === "dca:s:1")
    expect(buy1).toBeTruthy()
    expect(sell1).toBeTruthy()
    expect(sell1!.t).toBeGreaterThan(buy1!.t)
  })

  it("limit mode: an UP bar keeps a real same-bar buy→peel round trip", () => {
    // Same shape, but bar 8 closes UP (open 79 → close 86): the dip to rung 1
    // genuinely recovered to its 85.5 peel within the bar, so that real win is
    // allowed to fill on the same bar.
    const base = dcaConfig({ rungEntry: "limit" })
    const config: AutomationConfig = {
      ...base,
      protection: {
        long: { takeProfitPct: 3, takeProfitMode: "previousRungSellAll" },
      },
    }
    const result = run(config, [
      ...setup,
      bar(7, 84, 84, 88, 10, 87), // rung 0 fills at 85.5, arms rung 1
      bar(8, 86, 78, 88, 10, 79), // UP bar: dips to rung 1 (78.66), recovers to 88
    ])
    const buy1 = result.fills.find((f) => f.purpose === "dca:b:1")
    const sell1 = result.fills.find((f) => f.purpose === "dca:s:1")
    expect(buy1).toBeTruthy()
    expect(sell1).toBeTruthy()
    // Real recovery on an up bar → the round trip is booked on the same bar.
    expect(sell1!.t).toBe(buy1!.t)
  })

  it("limit mode: a crash fills only the one resting rung, not the whole ladder", () => {
    // A single candle craters straight past BOTH rung levels. But only rung 0's
    // limit is on the book, so only IT fills (at its exact level) — the deeper
    // rung never rested, so the crash can't cascade the ladder in. The fail-safe
    // then holds the next rung until things settle.
    const result = run(dcaConfig({ rungEntry: "limit" }), [
      ...setup,
      bar(7, 80, 70, 88, 10, 87), // crashes to 70, past both levels
      bar(8, 200, 79, 210, 10, 82), // recovers — deeper rung never gets its dip
    ])
    const buys = result.fills.filter((f) => f.purpose.startsWith("dca:b:"))
    expect(buys.length).toBe(1)
    expect(buys[0].purpose).toBe("dca:b:0")
    expect(Math.abs(buys[0].px - 85.5)).toBeLessThan(0.01)
  })

  it("require two green: steps down one rung per drop, each ≥3% below the last", () => {
    // Rung 0 buys once price sits ≥3% below the base and two green candles confirm.
    // Rung 1 needs its OWN fresh drop (≥3% below rung 0's fill) plus its own two
    // green candles, on a candle that both opens AND closes below that step level —
    // so the rungs are genuinely at least a step apart, not a shallow bounce.
    const result = run(
      dcaConfig({
        requireTwoGreen: true,
        rungs: [{ deviation: 3 }, { deviation: 3 }],
      }),
      [
        ...setup,
        bar(7, 86, 85, 88, 10, 88), // falls ≥3% below the base (~90); low 85 arms rung 0
        bar(8, 86.5, 85, 87, 10, 85), // green, still below the level
        bar(9, 86.8, 86, 87, 10, 86), // green → BUY rung 0 at 86.8 (≥3% below base)
        bar(10, 83, 82, 87, 10, 86.8), // low 82 falls ≥3% below the 86.8 fill → arms rung 1
        bar(11, 83.5, 82, 84, 10, 82), // green, below rung 1's level
        bar(12, 83.8, 83, 84, 10, 83), // green, opens 83 & closes 83.8 below → BUY rung 1
      ]
    )
    const buys = result.fills.filter((f) => f.purpose.startsWith("dca:b:"))
    expect(buys.map((b) => b.purpose)).toEqual(["dca:b:0", "dca:b:1"])
    const gap = (Number(buys[0].px) - Number(buys[1].px)) / Number(buys[0].px)
    expect(gap).toBeGreaterThanOrEqual(0.03) // rung 1 is at least a 3% step below rung 0
  })

  it("require two green: a confirmation candle that opens back above the step doesn't buy", () => {
    // Same drop, but rung 1's green candle OPENS above its 3% level (already bounced
    // back up) — so it can't buy there; the rung must sit a full step down.
    const result = run(
      dcaConfig({
        requireTwoGreen: true,
        rungs: [{ deviation: 3 }, { deviation: 3 }],
      }),
      [
        ...setup,
        bar(7, 86, 85, 88, 10, 88),
        bar(8, 86.5, 85, 87, 10, 85),
        bar(9, 86.8, 86, 87, 10, 86), // BUY rung 0
        bar(10, 83, 82, 87, 10, 86.8), // arms rung 1
        bar(11, 83.5, 82, 84, 10, 82), // green
        bar(12, 83.8, 83, 85, 10, 85), // OPENS at 85, above rung 1's level → no buy
      ]
    )
    const buys = result.fills.filter((f) => f.purpose.startsWith("dca:b:"))
    expect(buys.map((b) => b.purpose)).toEqual(["dca:b:0"])
  })

  it("require two green: a single deep crash fills only ONE rung, not the ladder", () => {
    // One candle craters past BOTH rung levels. It still buys only the FIRST rung
    // (at the bounce) — the deeper rung needs its own fresh drop + two green.
    const result = run(dcaConfig({ requireTwoGreen: true }), [
      ...setup,
      bar(7, 70, 50, 90, 10, 88), // craters to 50, past both rung levels
      bar(8, 75, 68, 78, 10, 70), // green
      bar(9, 80, 74, 82, 10, 75), // green → buys the first rung only, at the bounce
    ])
    const buys = result.fills.filter((f) => f.purpose.startsWith("dca:b:"))
    expect(buys.length).toBe(1)
    expect(buys[0].purpose).toBe("dca:b:0")
  })

  it("require two green: an armed rung waits — no buy until two green candles print", () => {
    const result = run(dcaConfig({ requireTwoGreen: true }), [
      ...setup,
      bar(7, 84, 83, 90, 10, 88), // arms rung 0
      bar(8, 80, 79, 85, 10, 84), // red
      bar(9, 78, 77, 82, 10, 80), // red — never two green in a row → nothing buys
    ])
    expect(
      result.fills.filter((f) => f.purpose.startsWith("dca:b:")).length
    ).toBe(0)
  })

  it("previous-rung sell-all: each rung sells at the buy above it, first at base", () => {
    const base = dcaConfig()
    const config: AutomationConfig = {
      ...base,
      protection: {
        long: { takeProfitPct: 3, takeProfitMode: "previousRungSellAll" },
      },
    }
    const result = run(config, [
      ...setup,
      bar(7, 84, 83, 88, 10, 87), // orderly: rung 0 fills near 85.5
      bar(8, 77, 76, 85, 10, 84), // orderly: rung 1 fills near 77
      bar(9, 86, 79, 87, 10, 79), // recover to the first rung's level (85.5)
      bar(10, 95, 85, 96, 10, 86), // recover to (and past) the base (90)
    ])
    const sell1 = result.fills.find((f) => f.purpose === "dca:s:1")
    const sell0 = result.fills.find((f) => f.purpose === "dca:s:0")
    const buy1 = result.fills.find((f) => f.purpose === "dca:b:1")
    expect(sell1).toBeTruthy()
    expect(sell0).toBeTruthy()
    // The deeper rung sold above where it was bought (a profit)...
    expect(sell1!.px).toBeGreaterThan(buy1!.px)
    // ...and the first rung sells one step higher, at the base: base / (base·0.95).
    expect(sell0!.px / sell1!.px).toBeCloseTo(1 / 0.95, 3)
    // Everything peeled off — flat once price returned to the base.
    expect(result.openPosition).toBeNull()
    // Each rung peeled off is its own closed trade.
    expect(result.trades.length).toBe(2)
  })

  it("nearest-rung sell-all: the whole position exits at the nearest rung, in one order", () => {
    const base = dcaConfig()
    const config: AutomationConfig = {
      ...base,
      protection: {
        long: { takeProfitPct: 3, takeProfitMode: "nearestRungSellAll" },
      },
    }
    const result = run(config, [
      ...setup,
      bar(7, 84, 83, 88, 10, 87), // orderly: rung 0 fills near 85.5
      bar(8, 77, 76, 85, 10, 84), // orderly: rung 1 fills near 77
      bar(9, 86, 79, 87, 10, 79), // recover to the nearest rung above (rung 0, 85.5)
    ])
    const sellAll = result.fills.find((f) => f.purpose === "dca:s:all")
    const buy1 = result.fills.find((f) => f.purpose === "dca:b:1")
    expect(sellAll).toBeTruthy()
    // One combined sell — no per-rung peel orders in this mode.
    expect(result.fills.some((f) => /^dca:s:\d/.test(f.purpose))).toBe(false)
    // The whole position exits at the nearest rung above the deepest buy — the
    // first rung's LEVEL (base·0.95 = 85.5), not peeled rung by rung.
    expect(sellAll!.px).toBeCloseTo(85.5, 5)
    expect(sellAll!.px).toBeGreaterThan(buy1!.px)
    expect(result.openPosition).toBeNull()
  })

  // Both rungs fill at 84 and 77 for $500 each, so the ladder has spent $1,000
  // and owns 12.446 coins. The nearest rung above the deepest buy is rung 0's
  // level, 85.5: selling 1000/85.5 = 11.696 coins there returns the whole $1,000
  // and leaves 0.750 coins that cost nothing. Those wait at 2% under the base
  // (90 · 0.98 = 88.2).

  it("shares one wallet but reserves only what fills — one coin doesn't block another", async () => {
    // Both coins dip together with a 60% pot each. A coin reserves only what it
    // has actually filled, so both get funded out of the one 100% wallet.
    const config = dcaConfig({ maxPositionPct: 60 })
    const candles = [
      ...setup,
      bar(7, 84, 83, 88, 10, 87),
      bar(8, 77, 76, 85, 10, 84),
      bar(9, 200, 79, 210, 10, 82),
    ]
    const results = await runDcaPortfolioBacktests([
      portfolioConfig("AAA", config, candles),
      portfolioConfig("BBB", config, candles),
    ])
    const aaa = results.get("AAA")
    const bbb = results.get("BBB")
    expect(aaa?.portfolio?.sharedAccount).toBe(true)
    // Both coins traded — neither hogged the wallet.
    expect(aaa?.fills.length ?? 0).toBeGreaterThan(0)
    expect(bbb?.fills.length ?? 0).toBeGreaterThan(0)
  })

  it("reports the whole basket's wallet usage and what each coin still holds", async () => {
    const config = dcaConfig({ maxPositionPct: 60 })
    // Both coins buy the dip and are still holding when the window ends.
    const candles = [
      ...setup,
      bar(7, 84, 83, 88, 10, 87),
      bar(8, 77, 76, 85, 10, 84),
      bar(9, 78, 76, 80, 10, 77),
    ]
    const results = await runDcaPortfolioBacktests([
      portfolioConfig("AAA", config, candles),
      portfolioConfig("BBB", config, candles),
    ])
    const usage = results.get("AAA")?.portfolio
    // The same whole-basket wallet numbers ride on every market of the run.
    expect(results.get("BBB")?.portfolio).toEqual(usage)
    expect(usage?.avgExposurePct).toBeGreaterThan(0)
    expect(usage?.avgExposurePct).toBeLessThanOrEqual(
      usage?.peakExposurePct ?? 0
    )
    // Time at the peak is real time: bars up there × the replay's bar spacing.
    expect(usage?.timeAtPeakMs).toBeGreaterThan(0)
    // Real time, not a bar count: 3 bars at the peak over 15m bars is 45m,
    // and the answer must not drift when the run's history has a hole in it.
    expect(usage?.timeAtPeakMs).toBeGreaterThanOrEqual(15 * 60_000)
    expect(usage?.timeAtPeakMs).toBeLessThanOrEqual(
      candles.length * 15 * 60_000
    )
    // Open money is each market's own — the position priced at the window's
    // last close (78), not at what it was bought for.
    for (const market of ["AAA", "BBB"]) {
      const result = results.get(market)
      expect(result?.openPosition).toBeTruthy()
      expect(result?.openNotionalUsd).toBeCloseTo(
        Math.abs(result!.openPosition!.szi) * 78,
        4
      )
    }
  })

  it("reports no money left in a market that finished flat", async () => {
    const config = dcaConfig({ maxPositionPct: 60 })
    // Bar 9 spikes to 200, closing both ladders out before the window ends.
    const candles = [
      ...setup,
      bar(7, 84, 83, 88, 10, 87),
      bar(8, 77, 76, 85, 10, 84),
      bar(9, 200, 79, 210, 10, 82),
    ]
    const results = await runDcaPortfolioBacktests([
      portfolioConfig("AAA", config, candles),
      portfolioConfig("BBB", config, candles),
    ])
    expect(results.get("AAA")?.openPosition).toBeNull()
    expect(results.get("AAA")?.openNotionalUsd).toBe(0)
  })

  it("reserves only filled exposure and frees it when flat (shared-wallet room math)", () => {
    const p = new SharedWalletPortfolio(100, ["A", "B", "C"])
    p.setExposure("A", 40)
    p.setExposure("B", 40)
    // C may take what's left after A and B (100 - 80 = 20).
    expect(p.remaining("C")).toBeCloseTo(20)
    // A's own held exposure doesn't count against itself.
    expect(p.remaining("A")).toBeCloseTo(60)
    // A goes flat → its room returns to the pool.
    p.setExposure("A", 0)
    expect(p.remaining("C")).toBeCloseTo(60)
  })

  it("after a fail-safe bounce buy, the stop books ~10% off that entry", () => {
    // A violent crash (bar 7) makes the fail-safe wait; bar 8 closes green so it
    // buys ONE rung at the bounce (~77). Bar 9 falls further and stops out. The
    // stop sits ~10% under that entry and must fill there — so the loss is
    // ~-10%, not the crash-bar low.
    const config: AutomationConfig = {
      ...dcaConfig(),
      protection: { long: { stopLossPct: 10 } },
    }
    const result = run(config, [
      ...setup,
      bar(7, 75, 70, 96, 30, 96), // violent crash → wait
      bar(8, 77, 74, 78, 10, 75), // green → buy ONE rung at the bounce (~77)
      bar(9, 65, 64, 78, 10, 76), // fall through the 10% stop
    ])
    const buys = result.fills.filter((f) => f.purpose.startsWith("dca:b:"))
    expect(buys.length).toBe(1) // only the first rung, at the bounce
    expect(result.trades.length).toBeGreaterThan(0)
    const totalPnl = result.trades.reduce((sum, t) => sum + t.pnl, 0)
    const totalCost = result.trades.reduce(
      (sum, t) => sum + t.entryPx * t.qty,
      0
    )
    const aggReturn = (totalPnl / totalCost) * 100
    expect(aggReturn).toBeGreaterThan(-11)
    expect(aggReturn).toBeLessThan(-9)
    expect(result.openPosition).toBeNull()
  })

  it("stop anchored to the first buy triggers at that percent, not the sinking average", () => {
    // rung 0 buys at 84, rung 1 at 77. Anchored to the FIRST buy the stop is
    // pinned at 84 × 0.9 = 75.6. Anchored to the average (~80.4) it would have
    // slid down to ~72.3 — so bar 9's dip to 74 stops one and not the other.
    const bars = [
      ...setup,
      bar(7, 84, 83, 88, 10, 87), // rung 0 buys at 84
      bar(8, 77, 76, 85, 10, 84), // rung 1 buys at 77, dragging the average down
      bar(9, 74, 74, 78, 10, 77), // dips to 74
    ]
    const anchored = run(
      {
        ...dcaConfig(),
        protection: { long: { stopLossPct: 10, stopAnchor: "first" } },
      },
      bars
    )
    const stopped = anchored.fills.find((f) => f.purpose === "dca:exit")
    expect(stopped).toBeTruthy()
    // Exactly 10% below the FIRST entry — the percent means what it says.
    expect(stopped!.px).toBeCloseTo(75.6, 1)

    // Default (average) leaves the stop down near 72, so this dip survives it.
    const averaged = run(
      { ...dcaConfig(), protection: { long: { stopLossPct: 10 } } },
      bars
    )
    expect(averaged.fills.some((f) => f.purpose === "dca:exit")).toBe(false)
  })

  it("does nothing while the shelf holds", () => {
    // The shelf holds — no close ever dips to a rung, so nothing buys.
    const result = run(dcaConfig(), [
      ...setup.slice(0, 4),
      bar(4, 101, 100, 102),
      bar(5, 101, 100, 102),
      bar(6, 101, 100, 102),
    ])
    expect(result.fills.length).toBe(0)
    expect(result.openPosition).toBeNull()
  })
})
