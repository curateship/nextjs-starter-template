import { describe, expect, it } from "vitest"

import { fairValueGapIndicator } from "@/lib/indicators/defs/fair-value-gap"
import type { IndicatorCandle } from "@/lib/indicators/contract"
import { computeFairValueGaps } from "./fair-value-gap"

/** One candle with an explicit time; v is irrelevant to gap detection. */
const c = (
  t: number,
  o: number,
  h: number,
  l: number,
  close: number
): IndicatorCandle => ({ t, o, h, l, c: close, v: 1 })

// A bullish imbalance: candle 2's low (105) sits entirely above candle 0's
// high (100), leaving the untraded band 100–105.
const BULL = [
  c(0, 99, 100, 98, 99),
  c(1, 101, 110, 101, 108),
  c(2, 106, 115, 105, 110),
]

// The same shape, mirrored down: candle 2's high (93) sits below candle 0's
// low (98), leaving the band 93–98.
const BEAR = [
  c(0, 99, 100, 98, 99),
  c(1, 97, 98, 90, 91),
  c(2, 92, 93, 88, 90),
]

describe("computeFairValueGaps", () => {
  it("detects a clean bullish gap with the right band, size, and one buy", () => {
    const { gaps, buy, sell } = computeFairValueGaps(BULL, 0.5)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({
      index: 2,
      side: "bull",
      top: 105,
      bottom: 100,
      fillIndex: null,
    })
    expect(gaps[0].sizePct).toBeCloseTo((5 / 110) * 100, 5)
    expect(buy).toEqual([false, false, true])
    expect(sell.some(Boolean)).toBe(false)
  })

  it("mirrors for a bearish gap", () => {
    const { gaps, buy, sell } = computeFairValueGaps(BEAR, 0.5)
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ index: 2, side: "bear", top: 98, bottom: 93 })
    expect(sell).toEqual([false, false, true])
    expect(buy.some(Boolean)).toBe(false)
  })

  it("ignores gaps smaller than minGapSize (the anti-chop dial)", () => {
    // Band is only 0.1 wide (~0.1% of price) — below the 0.5% floor.
    const tiny = [
      c(0, 99.95, 100.0, 99.9, 99.95),
      c(1, 100.05, 100.3, 100.02, 100.2),
      c(2, 100.15, 100.4, 100.1, 100.2),
    ]
    expect(computeFairValueGaps(tiny, 0.5).gaps).toHaveLength(0)
    expect(computeFairValueGaps(tiny, 0.5).buy.some(Boolean)).toBe(false)
    // The very same gap IS found once the floor drops to zero.
    expect(computeFairValueGaps(tiny, 0).gaps).toHaveLength(1)
  })

  it("does not fire when candles only touch (strict inequality)", () => {
    const touch = [
      c(0, 99, 100, 98, 99),
      c(1, 100, 105, 99, 104),
      c(2, 101, 106, 100, 102), // low 100 == high 100 of candle 0
    ]
    expect(computeFairValueGaps(touch, 0.5).gaps).toHaveLength(0)
  })

  it("marks the gap filled on the first bar that trades back through, not before", () => {
    const filled = [
      ...BULL,
      c(3, 110, 112, 106, 108), // low 106 stays above the band bottom (100)
      c(4, 107, 108, 99, 100), // low 99 <= 100 → fills the gap here
    ]
    const { gaps } = computeFairValueGaps(filled, 0.5)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].fillIndex).toBe(4)
  })

  it("is causal: a prefix yields the same earlier gaps and signals (fill is the only forward field)", () => {
    const filled = [
      ...BULL,
      c(3, 110, 112, 106, 108),
      c(4, 107, 108, 99, 100),
    ]
    const full = computeFairValueGaps(filled, 0.5)
    const prefix = computeFairValueGaps(filled.slice(0, 4), 0.5)
    // Same detection + signals at indices the prefix can see.
    expect(prefix.buy).toEqual(full.buy.slice(0, 4))
    expect(prefix.sell).toEqual(full.sell.slice(0, 4))
    const strip = (g: { index: number; side: string; top: number; bottom: number }) => ({
      index: g.index,
      side: g.side,
      top: g.top,
      bottom: g.bottom,
    })
    expect(prefix.gaps.map(strip)).toEqual(full.gaps.map(strip))
    // The prefix can't know about the future fill, so it's still open there.
    expect(prefix.gaps[0].fillIndex).toBeNull()
    expect(full.gaps[0].fillIndex).toBe(4)
  })
})

describe("fairValueGapIndicator (module)", () => {
  const filled = [
    ...BULL,
    c(3, 110, 112, 106, 108),
    c(4, 107, 108, 99, 100),
  ]

  it("emits one buy signal at the confirming candle and one gap box", () => {
    const out = fairValueGapIndicator.compute(filled, {
      minGapSize: 0.5,
      showFilled: true,
    })
    expect(out.signals).toEqual([{ time: 2, side: "buy" }])
    expect(out.paint.zones).toHaveLength(1)
    expect(out.paint.zones[0]).toMatchObject({
      fromMs: 1, // origin candle (index-1)
      toMs: 4, // where it fills
      top: 105,
      bottom: 100,
    })
  })

  it("drops filled gap boxes when showFilled is off", () => {
    const out = fairValueGapIndicator.compute(filled, {
      minGapSize: 0.5,
      showFilled: false,
    })
    expect(out.paint.zones).toHaveLength(0)
    // The signal still fires — only the drawing is suppressed.
    expect(out.signals).toEqual([{ time: 2, side: "buy" }])
  })

  it("extends an open gap box to the last candle", () => {
    const out = fairValueGapIndicator.compute(BULL, {
      minGapSize: 0.5,
      showFilled: true,
    })
    expect(out.paint.zones).toHaveLength(1)
    expect(out.paint.zones[0]).toMatchObject({ fromMs: 1, toMs: 2 })
  })

  it("caps how many boxes it draws so a trend can't bury the chart", () => {
    // A strong staircase up: every bar gaps over the one two back and never
    // fills, so 48 open gaps form — but only the most recent 30 are drawn.
    const uptrend = Array.from({ length: 50 }, (_, i) => {
      const l = 100 + i * 2
      return c(i, l + 0.5, l + 1, l, l + 0.5)
    })
    const out = fairValueGapIndicator.compute(uptrend, {
      minGapSize: 0.5,
      showFilled: true,
    })
    expect(out.paint.zones).toHaveLength(30)
    expect(out.paint.zones[0]?.id).toBe("fvg-bull-20")
    expect(out.paint.zones.at(-1)?.id).toBe("fvg-bull-49")
    // Signals are uncapped — the cap is only about drawing.
    expect(out.signals.filter((s) => s.side === "buy")).toHaveLength(48)
  })
})
