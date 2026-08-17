import { describe, expect, it } from "vitest"

import {
  defaultGridParams,
  gridLevels,
  gridLevelSize,
  gridOrderPlan,
  gridStepPct,
  gridRangeMovable,
  gridStopPx,
  type GridLevelState,
  type GridPlan,
  gridStopUnder,
  gridTakeProfitPx,
} from "./grid"
import { readSmartPlan } from "./smart-plan"

describe("gridLevels", () => {
  it("puts the deepest buy on the bottom and the shallowest sell on the top", () => {
    const levels = gridLevels({
      topPx: 120,
      bottomPx: 80,
      levels: 4,
      spacing: "even",
    })
    expect(levels).toHaveLength(4)
    // The range means exactly what it says at both ends.
    expect(levels[0].buyPx).toBeCloseTo(80, 9)
    expect(levels[3].sellPx).toBeCloseTo(120, 9)
  })

  it("puts the same dollars between every level when spread evenly", () => {
    const levels = gridLevels({
      topPx: 120,
      bottomPx: 80,
      levels: 4,
      spacing: "even",
    })
    // (120 − 80) / 4 = 10 a step.
    expect(levels.map((one) => one.buyPx)).toEqual([80, 90, 100, 110])
    for (const level of levels) {
      expect(level.sellPx - level.buyPx).toBeCloseTo(10, 9)
    }
  })

  it("sells one step above its own buy, never above the level above it", () => {
    const levels = gridLevels({
      topPx: 120,
      bottomPx: 80,
      levels: 4,
      spacing: "even",
    })
    for (const [index, level] of levels.entries()) {
      const above = levels[index + 1]
      // Which happens to be the same price as the next buy on an even grid —
      // but it is derived from its OWN buy, which is what a recycle needs.
      expect(level.sellPx).toBeCloseTo(above ? above.buyPx : 120, 9)
    }
  })

  it("puts the same percent between every level when spread by percent", () => {
    const levels = gridLevels({
      topPx: 160,
      bottomPx: 10,
      levels: 4,
      spacing: "compounding",
    })
    const steps = levels.map((one) => one.sellPx / one.buyPx)
    for (const step of steps) expect(step).toBeCloseTo(steps[0], 9)
    expect(levels[0].buyPx).toBeCloseTo(10, 9)
    expect(levels[3].sellPx).toBeCloseTo(160, 9)
  })

  it("draws nothing when the range is upside down or worthless", () => {
    expect(gridLevels({ topPx: 80, bottomPx: 120, levels: 4, spacing: "even" }))
      .toEqual([])
    expect(gridLevels({ topPx: 120, bottomPx: 0, levels: 4, spacing: "even" }))
      .toEqual([])
  })

  it("measures the step at the top of the range, where it is thinnest", () => {
    const levels = gridLevels({
      topPx: 120,
      bottomPx: 80,
      levels: 4,
      spacing: "even",
    })
    // 10 on a buy of 110, not 10 on a buy of 80 — checking the fattest step
    // would pass a grid whose upper levels all lose money.
    expect(gridStepPct(levels)).toBeCloseTo(10 / 110, 9)
  })
})

describe("gridOrderPlan", () => {
  const params = { ...defaultGridParams(), levels: 4, potPct: 20, maxOrderVolPct: 0 }

  it("splits the pot evenly, not on a ramp", () => {
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 10_000,
      params,
      sizeDecimals: 4,
      volume24hUsd: null,
    })
    // 20% of $10,000 is $2,000, over four levels: $500 each.
    for (const level of plan.levels) {
      expect(level.dollars).toBeCloseTo(500, 1)
    }
    expect(plan.totalCost).toBeCloseTo(2000, 1)
  })

  it("shrinks a buy that would be too big a share of the day's volume", () => {
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 10_000,
      params: { ...params, maxOrderVolPct: 1 },
      sizeDecimals: 4,
      // 1% of $20,000 is $200 — well under the $500 each level wanted.
      volume24hUsd: 20_000,
    })
    expect(plan.volumeCapped).toBe(true)
    for (const level of plan.levels) expect(level.dollars).toBeLessThanOrEqual(201)
  })

  it("flags a level too small to be an order rather than quietly dropping it", () => {
    const plan = gridOrderPlan({
      topPx: 120,
      bottomPx: 80,
      equity: 0.001,
      params,
      sizeDecimals: 0,
      volume24hUsd: null,
    })
    expect(plan.tooSmallIndex).toBe(0)
  })
})

describe("a level's money", () => {
  const level: Pick<GridLevelState, "budget" | "buyPx"> = {
    budget: 500,
    buyPx: 100,
  }

  it("spends the same dollars every cycle, however the price moved", () => {
    // The level always buys $500 of coin at its own frozen price. There is no
    // path by which a cheaper round leaves it with more to spend next time —
    // which is what would compound a fixed pot into a much larger one.
    expect(gridLevelSize(level, 4)).toBeCloseTo(5, 9)
    expect(gridLevelSize({ ...level, budget: 500 }, 4)).toBeCloseTo(5, 9)
  })

  it("never rounds a size up into more risk", () => {
    expect(gridLevelSize({ budget: 550, buyPx: 100 }, 0)).toBe(5)
  })
})

describe("gridStopPx", () => {
  const base = (over: Partial<GridPlan> = {}): Pick<
    GridPlan,
    "stopLoss" | "bottomPx" | "baseWatch"
  > => ({
    bottomPx: 80,
    stopLoss: { mode: "percent", underPct: 5, px: null, base: null },
    baseWatch: null,
    ...over,
  })

  it("hangs off the bottom of the range", () => {
    expect(gridStopPx(base())).toBeCloseTo(76, 9)
  })

  it("is nothing at all when the stop is switched off", () => {
    expect(gridStopPx(base({ stopLoss: null }))).toBeNull()
  })

  it("stays where a hand put it", () => {
    expect(
      gridStopPx(
        base({ stopLoss: { mode: "fixed", underPct: 5, px: 61, base: null } })
      )
    ).toBe(61)
  })

  it("rides a base that has confirmed BELOW the range", () => {
    expect(
      gridStopPx(
        base({
          stopLoss: {
            mode: "percent",
            underPct: 5,
            px: null,
            base: { underPct: 2, reclaimDays: 1 },
          },
          baseWatch: { levelPx: 70, seenTo: 0 },
        })
      )
    ).toBeCloseTo(68.6, 9)
  })

  it("ignores a base INSIDE the range, which is somewhere it means to buy", () => {
    // A stop at 95 would sit above eight of the twelve levels and sell the
    // whole grid on the first ordinary dip.
    expect(
      gridStopPx(
        base({
          stopLoss: {
            mode: "percent",
            underPct: 5,
            px: null,
            base: { underPct: 2, reclaimDays: 1 },
          },
          baseWatch: { levelPx: 95, seenTo: 0 },
        })
      )
    ).toBeCloseTo(76, 9)
  })
})

describe("reading a stored grid back", () => {
  const plan: GridPlan = {
    topPx: 120,
    bottomPx: 80,
    takeProfitPx: null,
    spacing: "even",
    potPct: 20,
    maxOrderVolPct: 0,
    startedAt: 1,
    sizeDecimals: 4,
    maxLeverage: 20,
    levels: [
      {
        buyPx: 80,
        sellPx: 90,
        sz: 5,
        budget: 400,
        heldSz: 0,
        status: "waiting",
        dead: false,
        cycles: 0,
      },
      {
        buyPx: 90,
        sellPx: 100,
        sz: 4,
        budget: 400,
        heldSz: 0,
        status: "waiting",
        dead: false,
        cycles: 0,
      },
    ],
    stopLoss: null,
    baseDetection: defaultGridParams().baseDetection,
    baseWatch: null,
    aimedSlPx: null,
    seenFillsTo: 0,
    cycles: 0,
    closedReason: null,
  }

  it("reads its own back and refuses junk rather than half-obeying it", () => {
    expect(readSmartPlan("grid", plan)).toEqual(plan)
    expect(readSmartPlan("grid", null)).toBeNull()
    expect(readSmartPlan("grid", { topPx: "up" })).toBeNull()
  })

  it("refuses a grid read as a ladder", () => {
    // A row of the wrong kind must be ignored, not half-obeyed by whichever
    // engine reached it first.
    expect(readSmartPlan("dca", plan)).toBeNull()
  })

  it("refuses a grid with fewer than two levels", () => {
    expect(readSmartPlan("grid", { ...plan, levels: [plan.levels[0]] })).toBeNull()
  })

  it("lets the range move for as long as the grid is running", () => {
    expect(gridRangeMovable(plan)).toBe(true)
    // Still movable while holding: a move settles the position to whatever the
    // new levels need, so nothing is left describing a price it did not pay.
    // The old rule locked the range after one upward drag, because dragging up
    // is exactly what creates a holding level.
    expect(
      gridRangeMovable({
        levels: [{ ...plan.levels[0], status: "holding" }, plan.levels[1]],
      })
    ).toBe(true)
    // Nothing left to move once every level is called off.
    expect(
      gridRangeMovable({
        levels: plan.levels.map((one) => ({ ...one, status: "cancelled" as const })),
      })
    ).toBe(false)
  })

})

/**
 * The two grid prices nothing was checking.
 *
 * Both decide where real money leaves a trade, and neither had a test.
 */
describe("where a grid's stop sits under its range", () => {
  it("is that percent below the bottom rung", () => {
    expect(gridStopUnder(100, 5)).toBeCloseTo(95, 9)
    expect(gridStopUnder(0.004, 10)).toBeCloseTo(0.0036, 12)
  })

  it("sits ON the bottom rung at zero, rather than nowhere", () => {
    expect(gridStopUnder(100, 0)).toBe(100)
  })
})

describe("a grid's take-profit", () => {
  it("only counts when it is above the range", () => {
    // A target inside the range is a level the grid means to sell at rung by
    // rung. Treating it as the exit would close the whole grid the first time
    // price touched a level it was built to trade.
    expect(gridTakeProfitPx({ takeProfitPx: 120, topPx: 100 })).toBe(120)
    expect(gridTakeProfitPx({ takeProfitPx: 90, topPx: 100 })).toBeNull()
    expect(gridTakeProfitPx({ takeProfitPx: 100, topPx: 100 })).toBeNull()
  })

  it("is nothing when none was set", () => {
    expect(gridTakeProfitPx({ takeProfitPx: null, topPx: 100 })).toBeNull()
  })
})
