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

function dcaConfig(overrides: Partial<AutomationConfig["dca"]> = {}): AutomationConfig {
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
      crackPct: 2.5,
      maxCrackBars: 4,
      respectFilterEnabled: false,
      respectLookbackMonths: 6,
      minRespectPct: 80,
      recoveryTargetPct: -2,
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

    const buys = result.fills.filter((fill) => fill.purpose.startsWith("dca:b:"))
    const exit = result.fills.find((fill) => fill.purpose === "dca:exit")

    // Both rungs filled, each on its own bar as price stepped down (not bunched).
    expect(buys.length).toBe(2)
    expect(buys.some((b) => Math.abs(b.px - 84) < 1e-6)).toBe(true)
    expect(buys.some((b) => Math.abs(b.px - 77) < 1e-6)).toBe(true)
    // Each rung deployed its dollar budget (5% of $10k), so the pot is exactly
    // the 10% cap regardless of the fill price.
    expect(
      buys.reduce((sum, fill) => sum + fill.px * fill.sz, 0)
    ).toBeCloseTo(1_000)
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

  it("skips the base when Past base quality has no history to judge", () => {
    // The filter is on but the data is only a few bars — no months of history
    // to score, so no ladder is armed and nothing buys.
    const result = run(dcaConfig({ respectFilterEnabled: true }), [
      ...setup,
      bar(7, 84, 83, 88, 10, 87),
      bar(8, 77, 76, 85, 10, 84),
      bar(9, 200, 79, 210, 10, 82),
    ])
    expect(result.fills.length).toBe(0)
    expect(result.openPosition).toBeNull()
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
    const result = run(dcaConfig({ requireTwoGreen: true, rungs: [{ deviation: 3 }, { deviation: 3 }] }), [
      ...setup,
      bar(7, 86, 85, 88, 10, 88), // falls ≥3% below the base (~90); low 85 arms rung 0
      bar(8, 86.5, 85, 87, 10, 85), // green, still below the level
      bar(9, 86.8, 86, 87, 10, 86), // green → BUY rung 0 at 86.8 (≥3% below base)
      bar(10, 83, 82, 87, 10, 86.8), // low 82 falls ≥3% below the 86.8 fill → arms rung 1
      bar(11, 83.5, 82, 84, 10, 82), // green, below rung 1's level
      bar(12, 83.8, 83, 84, 10, 83), // green, opens 83 & closes 83.8 below → BUY rung 1
    ])
    const buys = result.fills.filter((f) => f.purpose.startsWith("dca:b:"))
    expect(buys.map((b) => b.purpose)).toEqual(["dca:b:0", "dca:b:1"])
    const gap = (Number(buys[0].px) - Number(buys[1].px)) / Number(buys[0].px)
    expect(gap).toBeGreaterThanOrEqual(0.03) // rung 1 is at least a 3% step below rung 0
  })

  it("require two green: a confirmation candle that opens back above the step doesn't buy", () => {
    // Same drop, but rung 1's green candle OPENS above its 3% level (already bounced
    // back up) — so it can't buy there; the rung must sit a full step down.
    const result = run(dcaConfig({ requireTwoGreen: true, rungs: [{ deviation: 3 }, { deviation: 3 }] }), [
      ...setup,
      bar(7, 86, 85, 88, 10, 88),
      bar(8, 86.5, 85, 87, 10, 85),
      bar(9, 86.8, 86, 87, 10, 86), // BUY rung 0
      bar(10, 83, 82, 87, 10, 86.8), // arms rung 1
      bar(11, 83.5, 82, 84, 10, 82), // green
      bar(12, 83.8, 83, 85, 10, 85), // OPENS at 85, above rung 1's level → no buy
    ])
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
    const totalCost = result.trades.reduce((sum, t) => sum + t.entryPx * t.qty, 0)
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
