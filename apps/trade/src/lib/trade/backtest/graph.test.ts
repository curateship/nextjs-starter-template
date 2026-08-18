import { describe, expect, it } from "vitest"

import {
  barAt,
  buildGraphSeries,
  linePath,
  niceTicks,
  potHeight,
  potScale,
  potTicks,
  potValue,
  windowStats,
  type BacktestRunTrade,
  type EquityPoint,
} from "./graph"

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Eleven daily bars, so a window can be pointed at by hand. */
function pot(values: number[]): EquityPoint[] {
  return values.map((usd, day) => ({ t: Date.UTC(2026, 0, 1) + day * DAY, usd }))
}

function at(day: number): number {
  return Date.UTC(2026, 0, 1) + day * DAY
}

describe("buildGraphSeries", () => {
  it("measures how far below its own high the pot is, not below where it started", () => {
    const series = buildGraphSeries(pot([100, 200, 150, 300]), [], null, 100)
    expect(series.offPeakPct[0]).toBe(0)
    expect(series.offPeakPct[1]).toBe(0)
    // 150 against a high of 200 is a quarter off, even though it is still up on
    // the 100 it started with.
    expect(series.offPeakPct[2]).toBeCloseTo(-25)
    expect(series.offPeakPct[3]).toBe(0)
  })

  it("counts the trades that were open at each bar", () => {
    const trades: BacktestRunTrade[] = [
      { coin: "BTC", entryAt: at(0), exitAt: at(2), amountUsd: 100, pnl: 10, liquidated: false },
      { coin: "ETH", entryAt: at(1), exitAt: at(3), amountUsd: 100, pnl: -5, liquidated: false },
    ]
    const series = buildGraphSeries(pot([100, 100, 100, 100, 100]), [], trades, 100)
    expect(series.openCount).toEqual([1, 2, 2, 1, 0])
  })

  it("keeps a still-open trade open to the last bar", () => {
    const trades: BacktestRunTrade[] = [
      { coin: "BTC", entryAt: at(1), exitAt: null, amountUsd: 100, pnl: 0, liquidated: false },
    ]
    const series = buildGraphSeries(pot([100, 100, 100, 100]), [], trades, 100)
    expect(series.openCount).toEqual([0, 1, 1, 1])
    // Nothing was banked, so the banked line never moves off the starting money.
    expect(series.banked).toEqual([100, 100, 100, 100])
  })

  it("banks a trade's money only when it closes", () => {
    const trades: BacktestRunTrade[] = [
      { coin: "BTC", entryAt: at(0), exitAt: at(2), amountUsd: 100, pnl: 40, liquidated: false },
    ]
    const series = buildGraphSeries(pot([100, 130, 140, 140]), [], trades, 100)
    expect(series.banked).toEqual([100, 100, 140, 140])
  })

  it("shows how far the pot fell inside a bar, from what was lost in it", () => {
    // The pot is stamped once a bar, so a crash and its recovery inside one
    // bar leave a step up and no sign of the hole. These two trades lost
    // $3,000 in the bar that ends at day 2, so the pot was at least $3,000
    // below where it started that bar at some point during it.
    const trades: BacktestRunTrade[] = [
      { coin: "BTC", entryAt: at(1), exitAt: at(2), amountUsd: 2_000, pnl: -2_000, liquidated: true },
      { coin: "ETH", entryAt: at(1), exitAt: at(2), amountUsd: 1_000, pnl: -1_000, liquidated: true },
      { coin: "SOL", entryAt: at(1), exitAt: at(2), amountUsd: 5_000, pnl: 9_000, liquidated: false },
    ]
    const series = buildGraphSeries(pot([10_000, 10_000, 16_000]), [], trades, 10_000)
    // Day 2 closes at $16,000 having started the bar at $10,000 — and the
    // trough says it was down at $7,000 inside it.
    expect(series.trough?.[2]).toBe(7_000)
    // Quiet bars sit at their own close, so the line is untouched elsewhere.
    expect(series.trough?.[0]).toBe(10_000)
    expect(series.trough?.[1]).toBe(10_000)
  })

  it("never claims a trough deeper than the losses can prove", () => {
    const trades: BacktestRunTrade[] = [
      { coin: "BTC", entryAt: at(0), exitAt: at(1), amountUsd: 100, pnl: 500, liquidated: false },
    ]
    const series = buildGraphSeries(pot([10_000, 10_500]), [], trades, 10_000)
    // Nothing lost money, so there is no hole to draw.
    expect(series.trough).toEqual([10_000, 10_500])
  })

  it("says nothing rather than zero when the trades are not in hand", () => {
    const series = buildGraphSeries(pot([100, 120]), [10, 20], null, 100)
    expect(series.openCount).toBeNull()
    expect(series.banked).toBeNull()
    expect(series.inPlay).toEqual([10, 20])
  })
})

describe("windowStats", () => {
  const values = [10_000, 11_000, 14_000, 9_000, 12_000, 13_000]
  const inPlay = [0, 2_000, 7_000, 3_000, 1_000, 500]
  const trades: BacktestRunTrade[] = [
    { coin: "BTC", entryAt: at(0), exitAt: at(1), amountUsd: 1_000, pnl: 1_000, liquidated: false },
    { coin: "ETH", entryAt: at(1), exitAt: at(3), amountUsd: 2_000, pnl: -2_000, liquidated: true },
    { coin: "BTC", entryAt: at(3), exitAt: at(4), amountUsd: 1_000, pnl: 500, liquidated: false },
    { coin: "SOL", entryAt: at(4), exitAt: at(5), amountUsd: 1_000, pnl: -100, liquidated: false },
  ]
  const series = buildGraphSeries(pot(values), inPlay, trades, 10_000)

  it("measures the whole run against the money it started with", () => {
    const stats = windowStats(series, trades, 0, 5, 10_000)
    expect(stats.base).toBe(10_000)
    expect(stats.net).toBe(3_000)
    expect(stats.netPct).toBeCloseTo(30)
  })

  it("measures a window against the pot as it stood going in", () => {
    // Days 3 to 5: $9,000 to $13,000. Up $4,000 — not the $3,000 the run made
    // overall, and not measured off the $10,000 it opened with.
    const stats = windowStats(series, trades, 3, 5, 10_000)
    expect(stats.base).toBe(9_000)
    expect(stats.net).toBe(4_000)
    expect(stats.netPct).toBeCloseTo(44.44, 1)
  })

  it("measures the worst fall against the top it fell from", () => {
    const stats = windowStats(series, trades, 0, 5, 10_000)
    // $14,000 down to $9,000 is $5,000 off a $14,000 top — 35.7%, not 50% of
    // the starting money.
    expect(stats.worstDipUsd).toBe(5_000)
    expect(stats.worstDipPeak).toBe(14_000)
    expect(stats.worstDipPct).toBeCloseTo(35.71, 1)
  })

  it("says the pot never got back when it never got back", () => {
    const stats = windowStats(series, trades, 0, 5, 10_000)
    // It fell from $14,000 and ended at $13,000, so there is no recovery.
    expect(stats.recoveryDays).toBeNull()
  })

  it("counts the days from the low back to the old high", () => {
    const back = buildGraphSeries(pot([10_000, 14_000, 9_000, 12_000, 15_000]), [], null, 10_000)
    const stats = windowStats(back, null, 0, 4, 10_000)
    expect(stats.worstDipPeak).toBe(14_000)
    // Low on day 2, back above $14,000 on day 4.
    expect(stats.recoveryDays).toBe(2)
  })

  it("counts a trade in the window it finished in", () => {
    const stats = windowStats(series, trades, 0, 2, 10_000)
    // Only the first trade closed by day 2.
    expect(stats.tradesClosed).toBe(1)
    expect(stats.tradesWon).toBe(1)
  })

  it("weighs the winners against the losers", () => {
    const stats = windowStats(series, trades, 0, 5, 10_000)
    expect(stats.tradesClosed).toBe(4)
    expect(stats.tradesWon).toBe(2)
    // $1,500 made against $2,100 lost.
    expect(stats.profitFactor).toBeCloseTo(1_500 / 2_100)
    expect(stats.expectancy).toBeCloseTo((1_000 - 2_000 + 500 - 100) / 4)
  })

  it("gives no ratio at all when nothing lost money", () => {
    const winners: BacktestRunTrade[] = [
      { coin: "BTC", entryAt: at(0), exitAt: at(1), amountUsd: 100, pnl: 50, liquidated: false },
    ]
    const only = buildGraphSeries(pot([100, 150]), [0, 0], winners, 100)
    expect(windowStats(only, winners, 0, 1, 100).profitFactor).toBeNull()
  })

  it("counts the coins that made money out of the coins traded", () => {
    const stats = windowStats(series, trades, 0, 5, 10_000)
    // BTC made $1,500, ETH lost, SOL lost.
    expect(stats.coinsTraded).toBe(3)
    expect(stats.coinsGreen).toBe(1)
  })

  it("reports what the exchange took", () => {
    const stats = windowStats(series, trades, 0, 5, 10_000)
    expect(stats.liquidatedCount).toBe(1)
    expect(stats.liquidatedUsd).toBe(-2_000)
    // And nothing was taken in a window that liquidation falls outside of.
    expect(windowStats(series, trades, 4, 5, 10_000).liquidatedCount).toBe(0)
  })

  it("reports the hardest the wallet was worked, and when", () => {
    const stats = windowStats(series, trades, 0, 5, 10_000)
    // $7,000 at work against a $14,000 pot on day 2.
    expect(stats.peakWalletPct).toBeCloseTo(50)
    expect(stats.peakWalletUsd).toBe(7_000)
    expect(stats.peakWalletAt).toBe(at(2))
    expect(stats.inCoinsUsd).toBe(500)
  })

  it("counts the coin borrowing bought, not the margin behind it", () => {
    // The run stores the MARGIN each position put up. At 2× that same $7,000
    // of margin is holding $14,000 of coin — the whole wallet, not half of it,
    // which is the figure "how much of the wallet is in the market" means.
    const stats = windowStats(series, trades, 0, 5, 10_000, 2)
    expect(stats.peakWalletPct).toBeCloseTo(100)
    expect(stats.peakWalletUsd).toBe(14_000)
    expect(stats.inCoinsUsd).toBe(1_000)
  })

  it("draws a dash rather than a zero when the trades are missing", () => {
    const bare = buildGraphSeries(pot(values), inPlay, null, 10_000)
    const stats = windowStats(bare, null, 0, 5, 10_000)
    expect(stats.tradesClosed).toBeNull()
    expect(stats.profitFactor).toBeNull()
    expect(stats.timeInMarketPct).toBeNull()
    expect(stats.openNow).toBeNull()
    // The figures that come off the pot's own line still answer.
    expect(stats.net).toBe(3_000)
    expect(stats.worstDipUsd).toBe(5_000)
  })

  it("survives a run with one bar and no trades at all", () => {
    const single = buildGraphSeries(pot([10_000]), [0], [], 10_000)
    const stats = windowStats(single, [], 0, 0, 10_000)
    expect(stats.net).toBe(0)
    expect(stats.tradesClosed).toBe(0)
    expect(stats.bars).toBe(1)
  })
})

describe("barAt", () => {
  const times = [at(0), at(1), at(2), at(3)]

  it("finds the bar a moment falls on", () => {
    expect(barAt(times, at(2))).toBe(2)
    expect(barAt(times, at(2) + HOUR)).toBe(2)
  })

  it("clamps to the ends rather than falling off them", () => {
    expect(barAt(times, at(0) - DAY)).toBe(0)
    expect(barAt(times, at(9))).toBe(3)
    expect(barAt([], at(0))).toBe(0)
  })
})

describe("potScale", () => {
  it("stays even on a run that did not multiply", () => {
    expect(potScale([10_000, 12_000, 13_000], 0, 2).log).toBe(false)
  })

  it("goes log once the early years would be erased", () => {
    const scale = potScale([10_000, 50_000, 400_000], 0, 2)
    expect(scale.log).toBe(true)
    // The floor sits below the lowest point, so nothing is clipped off.
    expect(scale.lo).toBeLessThan(10_000)
  })
})

describe("potHeight", () => {
  it("puts the lowest value at the bottom and the highest at the top", () => {
    const y = potHeight({ log: false, lo: 0, hi: 100 }, 80, 80)
    expect(y(0)).toBeCloseTo(80)
    expect(y(100)).toBeCloseTo(0)
    expect(y(50)).toBeCloseTo(40)
  })

  it("gives a halving the same height wherever it happens, on a log scale", () => {
    const y = potHeight({ log: true, lo: 1_000, hi: 64_000 }, 120, 120)
    // 2,000 → 1,000 and 64,000 → 32,000 are both halvings, so both must move
    // the line the same distance.
    expect(y(1_000) - y(2_000)).toBeCloseTo(y(32_000) - y(64_000))
  })

  it("does not divide by zero on a run that never moved", () => {
    const y = potHeight({ log: false, lo: 500, hi: 500 }, 80, 80)
    expect(Number.isFinite(y(500))).toBe(true)
  })
})

describe("potValue", () => {
  it("undoes potHeight, so the crosshair names what the line sits at", () => {
    for (const scale of [
      { log: false, lo: 9_000, hi: 42_000 },
      { log: true, lo: 900, hi: 400_000 },
    ]) {
      const toY = potHeight(scale, 300, 280)
      const toValue = potValue(scale, 300, 280)
      for (const value of [1_000, 12_345, 380_000]) {
        if (value < scale.lo || value > scale.hi) continue
        expect(toValue(toY(value))).toBeCloseTo(value, 3)
      }
    }
  })

  it("does not divide by zero on a run that never moved", () => {
    const at = potValue({ log: false, lo: 500, hi: 500 }, 80, 80)
    expect(Number.isFinite(at(40))).toBe(true)
  })
})

describe("linePath", () => {
  it("always finishes on the last bar, whatever the stride skipped", () => {
    const values = Array.from({ length: 5_000 }, (_, bar) => bar)
    const path = linePath(values, 0, 4_999, (bar) => bar / 10, (v) => v)
    expect(path.startsWith("M0.0 0.0")).toBe(true)
    expect(path.endsWith("L499.9 4999.0")).toBe(true)
  })

  it("draws at most a point per pixel", () => {
    const values = Array.from({ length: 100_000 }, () => 1)
    const path = linePath(values, 0, 99_999, (bar) => bar / 200, (v) => v)
    // 500 pixels wide, so roughly 500 points and not a hundred thousand.
    expect(path.split("L").length).toBeLessThan(700)
  })

  it("closes the shape onto the floor when given one", () => {
    const path = linePath([1, 2, 3], 0, 2, (bar) => bar, (v) => v, 10)
    expect(path.endsWith("Z")).toBe(true)
    expect(path).toContain("10.0")
  })
})

describe("potTicks", () => {
  it("rules an even axis on round numbers", () => {
    expect(potTicks({ log: false, lo: 9_000, hi: 21_000 })).toEqual([
      10_000, 15_000, 20_000,
    ])
  })

  it("spreads a log axis across the run instead of bunching at the top", () => {
    const ticks = potTicks({ log: true, lo: 900, hi: 400_000 })
    // Evenly-spaced values would put all four lines in the top quarter. These
    // cover every decade the money passed through.
    expect(ticks).toContain(1_000)
    expect(ticks).toContain(10_000)
    expect(ticks).toContain(100_000)
    expect(ticks.every((tick) => tick >= 900 && tick <= 400_000)).toBe(true)
  })

  it("stops rather than spinning on a nonsense scale", () => {
    expect(potTicks({ log: true, lo: 1, hi: Number.MAX_SAFE_INTEGER }).length)
      .toBeLessThan(40)
  })
})

describe("niceTicks", () => {
  it("puts gridlines on round numbers", () => {
    expect(niceTicks(9_000, 21_000)).toEqual([10_000, 15_000, 20_000])
  })

  it("gives nothing to draw rather than looping forever on a flat run", () => {
    expect(niceTicks(5, 5)).toEqual([])
  })
})
