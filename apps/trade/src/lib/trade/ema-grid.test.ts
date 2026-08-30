import { describe, expect, it } from "vitest"

import { defaultTradeGridSettings } from "@/lib/automations/nodes/trade-grid"
import type { CandleBar } from "@/lib/protocols/contracts"
import {
  EMA_GRID_HISTORY_BARS,
  emaGridPlacement,
  emaGridStance,
} from "@/lib/trade/ema-grid"
import {
  gridOrderPlan,
  gridRowRungNumber,
  type GridDirection,
} from "@/lib/trade/grid"

function candles(
  count: number,
  last: (index: number) => Pick<CandleBar, "open" | "high" | "low" | "close">
): CandleBar[] {
  return Array.from({ length: count }, (_, index) => ({
    openTime: index * 4 * 60 * 60 * 1_000,
    volume: 1,
    ...last(index),
  }))
}

const flat = () => ({ open: 100, high: 101, low: 99, close: 100 })

describe("the clean run around the EMA", () => {
  it("calls long only when every recent wick is above the line", () => {
    const bars = candles(EMA_GRID_HISTORY_BARS, (index) =>
      index >= EMA_GRID_HISTORY_BARS - 18
        ? { open: 111, high: 112, low: 110, close: 111 }
        : flat()
    )

    expect(emaGridStance(bars, { emaPeriod: 200, cleanBars: 18 })).toBe("long")
  })

  it("calls short when every recent wick is below the line", () => {
    const bars = candles(EMA_GRID_HISTORY_BARS, (index) =>
      index >= EMA_GRID_HISTORY_BARS - 18
        ? { open: 89, high: 90, low: 88, close: 89 }
        : flat()
    )

    expect(emaGridStance(bars, { emaPeriod: 200, cleanBars: 18 })).toBe("short")
  })

  it("restarts the count when one wick touches the EMA", () => {
    const bars = candles(EMA_GRID_HISTORY_BARS, (index) => {
      if (index < EMA_GRID_HISTORY_BARS - 18) return flat()
      return {
        open: 111,
        high: 112,
        low: index === EMA_GRID_HISTORY_BARS - 9 ? 100 : 110,
        close: 111,
      }
    })

    expect(emaGridStance(bars, { emaPeriod: 200, cleanBars: 18 })).toBe("none")
  })

  it("returns no stance for mixed candles", () => {
    const bars = candles(EMA_GRID_HISTORY_BARS, (index) =>
      index % 2 === 0
        ? { open: 111, high: 112, low: 110, close: 111 }
        : { open: 89, high: 90, low: 88, close: 89 }
    )

    expect(emaGridStance(bars, { emaPeriod: 200, cleanBars: 18 })).toBe("none")
  })

  it("waits for the full 600 closed candles", () => {
    const bars = candles(EMA_GRID_HISTORY_BARS - 1, () => ({
      open: 111,
      high: 112,
      low: 110,
      close: 111,
    }))

    expect(emaGridStance(bars, { emaPeriod: 200, cleanBars: 18 })).toBe("none")
  })
})

describe("custom rung order", () => {
  function rowsFor(direction: GridDirection) {
    const settings = defaultTradeGridSettings()
    settings.grid = {
      ...settings.grid,
      levels: 3,
      manualSizing: true,
      manualRungPcts: [10, 30, 60],
    }
    const placement = emaGridPlacement(settings, direction, 100)
    if (!placement) throw new Error("expected a Grid placement")

    const plan = gridOrderPlan({
      ...placement,
      equity: 1_000,
      sizeDecimals: 6,
      volume24hUsd: null,
    })
    const downTheChart = [...plan.levels].sort((a, b) => b.buyPx - a.buyPx)

    return {
      numbers: downTheChart.map((_, index) =>
        gridRowRungNumber(index, downTheChart.length, direction)
      ),
      dollars: downTheChart.map((level) => Math.round(level.dollars)),
    }
  }

  it("puts the largest long rung at the bottom and short rung at the top", () => {
    expect(rowsFor("long")).toEqual({
      numbers: [1, 2, 3],
      dollars: [20, 60, 120],
    })
    expect(rowsFor("short")).toEqual({
      numbers: [3, 2, 1],
      dollars: [120, 60, 20],
    })
  })
})
