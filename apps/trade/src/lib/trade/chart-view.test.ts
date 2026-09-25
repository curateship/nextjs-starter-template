import { describe, expect, it } from "vitest"

import {
  frameOf,
  readChartView,
  sameView,
  viewOf,
  type ChartView,
} from "@/lib/trade/chart-view"

/** A view with the library's own margins, so a test can name only what it means. */
function view(parts: Partial<ChartView>): ChartView {
  return { bars: 100, gap: 0, marginTop: 0.2, marginBottom: 0.1, ...parts }
}

/**
 * A chart 500 candles long, showing the last 100, with the candles between
 * $90 and $110 and the plot running from $115 down to $85 — so a quarter of
 * the height is above them and a sixth below.
 */
const showing = {
  range: { from: 399, to: 499 },
  barCount: 500,
  top: 115,
  bottom: 85,
  high: 110,
  low: 90,
}

describe("reading what the chart is showing", () => {
  it("measures the zoom in candles and the position from the newest one", () => {
    const now = viewOf(showing)
    expect(now?.bars).toBe(100)
    expect(now?.gap).toBe(0)
  })

  it("measures the squash as the share of the height above and below", () => {
    const now = viewOf(showing)
    // $115 down to $110 is 5 of the 30 dollars on screen.
    expect(now?.marginTop).toBeCloseTo(5 / 30, 5)
    // $90 down to $85 is another 5.
    expect(now?.marginBottom).toBeCloseTo(5 / 30, 5)
  })

  it("notices being scrolled back through history", () => {
    expect(viewOf({ ...showing, range: { from: 349, to: 449 } })?.gap).toBe(50)
  })

  it("notices being scrolled out past the newest candle", () => {
    expect(viewOf({ ...showing, range: { from: 449, to: 549 } })?.gap).toBe(-50)
  })

  it("refuses a view too narrow or too wide to be worth keeping", () => {
    expect(viewOf({ ...showing, range: { from: 498, to: 499 } })).toBeNull()
    expect(
      viewOf({ ...showing, range: { from: -500_000, to: 499 } })
    ).toBeNull()
    expect(
      viewOf({ ...showing, range: { from: Number.NaN, to: 499 } })
    ).toBeNull()
  })

  it("refuses a chart with no height to measure", () => {
    expect(viewOf({ ...showing, top: 100, bottom: 100 })).toBeNull()
  })
})

describe("putting that view on another chart", () => {
  it("shows the same number of candles, however many the market has", () => {
    expect(frameOf(view({ bars: 100 }), 500)).toEqual({ from: 399, to: 499 })
    // A market with three times the history: still 100 candles across.
    expect(frameOf(view({ bars: 100 }), 1_500)).toEqual({
      from: 1_399,
      to: 1_499,
    })
  })

  it("keeps the scroll back through history, exactly", () => {
    expect(frameOf(view({ bars: 100, gap: 50 }), 500)).toEqual({
      from: 349,
      to: 449,
    })
  })

  it("keeps the space past the newest candle, exactly", () => {
    // Half the screen is empty room to the right — a real place to stand, and
    // where the chart sits after zooming in near the live edge.
    expect(frameOf(view({ bars: 100, gap: -50 }), 500)).toEqual({
      from: 449,
      to: 549,
    })
  })

  it("slides back when even the newest candle would be off screen", () => {
    expect(frameOf(view({ bars: 100, gap: -1_000 }), 500)).toEqual({
      from: 499,
      to: 599,
    })
  })

  it("comes back to exactly where it started", () => {
    const range = { from: 349.5, to: 449.5 }
    const now = viewOf({ ...showing, range })
    expect(now).not.toBeNull()
    expect(frameOf(now!, 500)).toEqual(range)
  })

  it("keeps the zoom on a market with a shorter history", () => {
    // 100 candles wanted, only 40 exist: still 100 across, with the empty
    // space on the left, rather than a quietly different zoom.
    expect(frameOf(view({ bars: 100 }), 40)).toEqual({ from: -61, to: 39 })
  })

  it("slides back to the data rather than showing an empty chart", () => {
    // Scrolled 400 candles back on a market that only has 50 — the window
    // keeps its width and stops where the oldest candle is.
    expect(frameOf(view({ bars: 20, gap: 400 }), 50)).toEqual({
      from: -20,
      to: 0,
    })
  })

  it("has nothing to say about a chart with no candles", () => {
    expect(frameOf(view({}), 0)).toBeNull()
    expect(frameOf(view({}), 1)).toBeNull()
  })
})

describe("reading a saved view back", () => {
  it("takes a good one", () => {
    expect(
      readChartView({ bars: 120, gap: 3.5, marginTop: 0.3, marginBottom: 0.25 })
    ).toEqual({ bars: 120, gap: 3.5, marginTop: 0.3, marginBottom: 0.25 })
  })

  it("still gives the zoom back from a view saved before the squash existed", () => {
    expect(readChartView({ bars: 120, gap: 3.5 })).toEqual({
      bars: 120,
      gap: 3.5,
      marginTop: 0.2,
      marginBottom: 0.1,
    })
  })

  it("drops one it cannot use rather than framing the chart wrongly", () => {
    expect(readChartView(null)).toBeNull()
    expect(readChartView({ bars: 1, gap: 0 })).toBeNull()
    expect(readChartView({ gap: 0 })).toBeNull()
    expect(readChartView({ bars: "100", gap: 0 })).toBeNull()
    expect(readChartView({ bars: Number.NaN, gap: 0 })).toBeNull()
    expect(readChartView({ bars: 100, gap: 0, marginTop: 2 })).toBeNull()
  })
})

describe("telling two views apart", () => {
  it("ignores a difference too small to see", () => {
    expect(sameView(view({}), view({ bars: 100.001 }))).toBe(true)
    expect(sameView(view({}), view({ bars: 101 }))).toBe(false)
    expect(sameView(view({}), view({ marginTop: 0.3 }))).toBe(false)
    expect(sameView(null, null)).toBe(true)
    expect(sameView(null, view({}))).toBe(false)
  })
})
