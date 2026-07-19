import { describe, expect, it } from "vitest"

import {
  chartPositionHandleAt,
  chartPositionStats,
  clampChartPosition,
  createChartPosition,
  dragChartPosition,
  isInsideChartPosition,
  type ChartPosition,
} from "@/lib/trading/chart-positions"

const long: ChartPosition = {
  id: "position-1",
  side: "long",
  startTime: 1_700_000_000,
  endTime: 1_700_020_000,
  entry: 100,
  target: 120,
  stop: 90,
}

describe("position drawing model", () => {
  it("places a new drawing with its stop below and a 2R target above", () => {
    const created = createChartPosition({
      id: "position-new",
      side: "long",
      entry: 100,
      startTime: 1_000,
      endTime: 2_000,
    })

    expect(created.stop).toBeCloseTo(97)
    expect(created.target).toBeCloseTo(106)
  })

  it("mirrors the zones for a short", () => {
    const created = createChartPosition({
      id: "position-short",
      side: "short",
      entry: 100,
      startTime: 1_000,
      endTime: 2_000,
    })

    expect(created.stop).toBeCloseTo(103)
    expect(created.target).toBeCloseTo(94)
  })

  it("turns the price gaps into percent and a risk/reward ratio", () => {
    const stats = chartPositionStats(long)

    expect(stats.ratio).toBe(2)
    expect(stats.stopPct).toBeCloseTo(-10)
    expect(stats.targetPct).toBeCloseTo(20)
  })

  it("reads a short's percentages in the opposite direction", () => {
    const short: ChartPosition = { ...long, side: "short", target: 80, stop: 110 }
    const stats = chartPositionStats(short)

    expect(stats.targetPct).toBeCloseTo(20)
    expect(stats.stopPct).toBeCloseTo(-10)
    expect(stats.ratio).toBe(2)
  })

  it("stops a dragged target from crossing to the losing side of entry", () => {
    const dragged = dragChartPosition(
      { handle: "target", origin: long, grab: { time: 0, price: 0 } },
      { time: 1_700_010_000, price: 50 }
    )

    expect(dragged.target).toBeGreaterThan(long.entry)
  })

  it("moves only the entry when the middle line is dragged", () => {
    const dragged = dragChartPosition(
      {
        handle: "entry",
        origin: long,
        grab: { time: 1_700_000_000, price: 100 },
      },
      { time: 1_700_000_600, price: 105 }
    )

    expect(dragged.entry).toBe(105)
    expect(dragged.target).toBe(long.target)
    expect(dragged.stop).toBe(long.stop)
    expect(dragged.startTime).toBe(long.startTime)
  })

  it("keeps a dragged entry between its own stop and target", () => {
    const above = dragChartPosition(
      { handle: "entry", origin: long, grab: { time: 0, price: 0 } },
      { time: 0, price: 500 }
    )
    const below = dragChartPosition(
      { handle: "entry", origin: long, grab: { time: 0, price: 0 } },
      { time: 0, price: 1 }
    )

    expect(above.entry).toBeLessThan(long.target)
    expect(below.entry).toBeGreaterThan(long.stop)
  })

  it("carries the whole plan when the body is dragged", () => {
    const dragged = dragChartPosition(
      {
        handle: "body",
        origin: long,
        grab: { time: 1_700_000_000, price: 100 },
      },
      { time: 1_700_000_600, price: 110 }
    )

    expect(dragged.entry).toBe(110)
    expect(dragged.target).toBe(130)
    expect(dragged.stop).toBe(100)
    expect(dragged.startTime).toBe(1_700_000_600)
    expect(dragged.endTime).toBe(1_700_020_600)
  })

  it("never lets a drag carry a price to zero", () => {
    const dragged = dragChartPosition(
      {
        handle: "body",
        origin: long,
        grab: { time: 1_700_000_000, price: 100 },
      },
      { time: 1_700_000_000, price: -500 }
    )

    expect(dragged.stop).toBeGreaterThan(0)
    expect(dragged.entry).toBeGreaterThan(0)
  })

  it("keeps the right edge right of the left edge", () => {
    expect(
      clampChartPosition({ ...long, endTime: long.startTime - 5_000 }).endTime
    ).toBe(long.startTime + 1)
  })

  it("finds the handle under the pointer and the body around it", () => {
    const box = { left: 10, right: 200, entryY: 100, stopY: 150, targetY: 50 }

    expect(chartPositionHandleAt({ x: 11, y: 149 }, box, 8)).toBe("stop")
    expect(chartPositionHandleAt({ x: 200, y: 100 }, box, 8)).toBe("width")
    // Grabbable along the whole line, not only at its dot.
    expect(chartPositionHandleAt({ x: 120, y: 100 }, box, 8)).toBe("entry")
    expect(chartPositionHandleAt({ x: 120, y: 52 }, box, 8)).toBe("target")
    // Away from every line, and outside the drawing entirely.
    expect(chartPositionHandleAt({ x: 120, y: 130 }, box, 8)).toBeNull()
    expect(chartPositionHandleAt({ x: 400, y: 100 }, box, 8)).toBeNull()
    expect(isInsideChartPosition({ x: 120, y: 100 }, box)).toBe(true)
    expect(isInsideChartPosition({ x: 300, y: 100 }, box)).toBe(false)
  })
})
