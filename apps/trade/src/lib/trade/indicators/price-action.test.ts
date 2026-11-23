import { describe, expect, it } from "vitest"

import type {
  IndicatorCandle,
  IndicatorContext,
  IndicatorParams,
} from "@/lib/trade/indicators/contract"
import { readIndicatorParams } from "@/lib/trade/indicators/contract"
import { priceActionIndicator } from "@/lib/trade/indicators/price-action"
import {
  indicatorSettingsSchema,
  indicatorSignals,
  readIndicatorSettings,
} from "@/lib/trade/indicators/registry"

const BAR = 15 * 60_000
const CHART: IndicatorContext = { zone: "UTC", interval: "15m" }

/** open, high, low, close */
type Row = [number, number, number, number]

function candlesOf(rows: Row[]): IndicatorCandle[] {
  return rows.map(([open, high, low, close], index) => ({
    openTime: index * BAR,
    open,
    high,
    low,
    close,
  }))
}

const PATTERN_KEYS = priceActionIndicator.groups
  .filter((group) => group.title.endsWith("patterns"))
  .flatMap((group) => group.keys)

/** Every pattern switched off except the ones named. */
function only(keys: string[], extra: IndicatorParams = {}): IndicatorParams {
  return {
    ...Object.fromEntries(PATTERN_KEYS.map((key) => [key, keys.includes(key)])),
    ...extra,
  }
}

/**
 * Four candles whose closes fall (or rise) one after another into `price`.
 * Each opens where it closes, so none of them is a pattern of its own.
 */
function lead(price: number, into: "falling" | "rising"): Row[] {
  const step = into === "falling" ? 5 : -5
  return [4, 3, 2, 1].map((k) => {
    const close = price + k * step
    return [close, close + 2, close - 2, close]
  })
}

type Case = {
  key: string
  side: "up" | "down"
  reversal: boolean
  candles: Row[]
  /** The same candles with one rule just missed. */
  nearly: Row[]
  /** Where the arrow sits: the lowest low for a buy, highest high for a sell. */
  at: number
}

const CASES: Case[] = [
  {
    key: "bullishEngulfing",
    side: "up",
    reversal: true,
    candles: [
      [104, 105, 99, 100],
      // Opens AT the last close, the way a coin does. Touching counts.
      [100, 107, 98, 106],
    ],
    nearly: [
      [104, 105, 99, 100],
      // Covers the whole body but closes under the first candle's high.
      [100, 105, 98, 104.9],
    ],
    at: 98,
  },
  {
    // The task's worked example: body $200, lower wick $1,800.
    key: "hammer",
    side: "up",
    reversal: true,
    candles: [[100_000, 100_000, 98_000, 99_800]],
    nearly: [[100_000, 100_300, 98_000, 99_800]],
    at: 98_000,
  },
  {
    key: "morningStar",
    side: "up",
    reversal: true,
    candles: [
      [104, 105, 99, 100],
      [99, 100.5, 97.5, 98.5],
      [99, 104, 98, 103],
    ],
    nearly: [
      [104, 105, 99, 100],
      [99, 100.5, 97.5, 98.5],
      [99, 104, 98, 101.9],
    ],
    at: 97.5,
  },
  {
    key: "piercing",
    side: "up",
    reversal: true,
    candles: [
      [104, 105, 99, 100],
      [100, 104, 98, 103],
    ],
    nearly: [
      [104, 105, 99, 100],
      [100, 104, 98, 101.9],
    ],
    at: 98,
  },
  {
    key: "bullishMarubozu",
    side: "up",
    reversal: false,
    candles: [[100, 110, 100, 110]],
    nearly: [[100, 111, 100, 110]],
    at: 100,
  },
  {
    key: "threeWhiteSoldiers",
    side: "up",
    reversal: false,
    candles: [
      [100, 105, 99, 104],
      [104, 109, 103, 108],
      [108, 113, 107, 112],
    ],
    nearly: [
      [100, 105, 99, 104],
      [104, 109, 103, 108],
      [105, 110, 104, 108],
    ],
    at: 99,
  },
  {
    key: "bullishHarami",
    side: "up",
    reversal: true,
    candles: [
      [110, 111, 99, 100],
      [100, 105, 98, 101],
    ],
    nearly: [
      [110, 111, 99, 100],
      [99.5, 104, 98, 100.5],
    ],
    at: 98,
  },
  {
    key: "invertedHammer",
    side: "up",
    reversal: true,
    candles: [[100, 104, 99.9, 100.5]],
    nearly: [[100, 104, 99.5, 100.5]],
    at: 99.9,
  },
  {
    key: "tweezerBottom",
    side: "up",
    reversal: true,
    candles: [
      [104, 105, 99, 100],
      [100, 104, 99.05, 103],
    ],
    nearly: [
      [104, 105, 99, 100],
      [100, 104, 98.8, 103],
    ],
    at: 99,
  },
  {
    key: "bearishEngulfing",
    side: "down",
    reversal: true,
    candles: [
      [96, 101, 95, 100],
      [100, 102, 93, 94],
    ],
    nearly: [
      [96, 101, 95, 100],
      // Covers the whole body but closes above the first candle's low.
      [100, 102, 93, 95.1],
    ],
    at: 102,
  },
  {
    key: "shootingStar",
    side: "down",
    reversal: true,
    candles: [[100, 104, 99.9, 100.5]],
    nearly: [[100, 104, 99.5, 100.5]],
    at: 104,
  },
  {
    key: "eveningStar",
    side: "down",
    reversal: true,
    candles: [
      [96, 101, 95, 100],
      [101, 102.5, 99.5, 101.5],
      [101, 102, 96, 97],
    ],
    nearly: [
      [96, 101, 95, 100],
      [101, 102.5, 99.5, 101.5],
      [101, 102, 96, 98.1],
    ],
    at: 102.5,
  },
  {
    key: "darkCloudCover",
    side: "down",
    reversal: true,
    candles: [
      [96, 101, 95, 100],
      [100, 102, 96, 97],
    ],
    nearly: [
      [96, 101, 95, 100],
      [100, 102, 96, 98.1],
    ],
    at: 102,
  },
  {
    key: "bearishMarubozu",
    side: "down",
    reversal: false,
    candles: [[110, 110, 100, 100]],
    nearly: [[110, 110, 99, 100]],
    at: 110,
  },
  {
    key: "threeBlackCrows",
    side: "down",
    reversal: false,
    candles: [
      [112, 113, 107, 108],
      [108, 109, 103, 104],
      [104, 105, 99, 100],
    ],
    nearly: [
      [112, 113, 107, 108],
      [108, 109, 103, 104],
      [107, 108, 103, 104],
    ],
    at: 113,
  },
  {
    key: "bearishHarami",
    side: "down",
    reversal: true,
    candles: [
      [90, 101, 89, 100],
      [100, 102, 95, 99],
    ],
    nearly: [
      [90, 101, 89, 100],
      [100.5, 102, 96, 99.5],
    ],
    at: 102,
  },
  {
    key: "hangingMan",
    side: "down",
    reversal: true,
    candles: [[100, 100.1, 96, 99.5]],
    nearly: [[100, 100.5, 96, 99.5]],
    at: 100.1,
  },
  {
    key: "tweezerTop",
    side: "down",
    reversal: true,
    candles: [
      [96, 101, 95, 100],
      [100, 101.05, 96, 97],
    ],
    nearly: [
      [96, 101, 95, 100],
      [100, 101.3, 96, 97],
    ],
    at: 101.05,
  },
]

function withLead(rows: Row[], into: "falling" | "rising") {
  return candlesOf([...lead(rows[0][0], into), ...rows])
}

function rightTrend(one: Case) {
  return one.side === "up" ? "falling" : "rising"
}

function wrongTrend(one: Case) {
  return one.side === "up" ? "rising" : "falling"
}

describe("the price action indicator", () => {
  it("has a case here for every one of its eighteen switches", () => {
    expect(PATTERN_KEYS).toHaveLength(18)
    expect(CASES.map((one) => one.key).sort()).toEqual([...PATTERN_KEYS].sort())
  })

  describe.each(CASES)("$key", (one) => {
    it("prints on the pattern's last candle, at the right end of it", () => {
      const candles = withLead(one.candles, rightTrend(one))
      const last = candles.at(-1)!.openTime
      const params = only([one.key])

      expect(priceActionIndicator.signals?.(candles, params)).toEqual([
        { time: last, side: one.side === "up" ? "buy" : "sell" },
      ])
      expect(
        priceActionIndicator.compute(candles, params, CHART).marks
      ).toEqual([{ time: last, price: one.at, side: one.side }])
    })

    it("stays quiet when one rule is only just missed", () => {
      const candles = withLead(one.nearly, rightTrend(one))
      expect(priceActionIndicator.signals?.(candles, only([one.key]))).toEqual(
        []
      )
    })

    if (one.reversal) {
      it("stays quiet when price was going the wrong way into it", () => {
        const candles = withLead(one.candles, wrongTrend(one))
        expect(
          priceActionIndicator.signals?.(candles, only([one.key]))
        ).toEqual([])
        // And Trend before at 0 switches that check off.
        expect(
          priceActionIndicator.signals?.(
            candles,
            only([one.key], { trendBars: 0 })
          )
        ).toHaveLength(1)
      })
    } else {
      it("needs no move before it", () => {
        const candles = withLead(one.candles, wrongTrend(one))
        expect(
          priceActionIndicator.signals?.(candles, only([one.key]))
        ).toHaveLength(1)
      })
    }
  })

  it("does not call two small bodies an engulfing when a wick hangs past", () => {
    // The pair Tyler flagged on 23 Sep 2026, measured off his screenshot in
    // pixels: a tiny green body with a long wick below, then a red body only
    // a little bigger that stops far above that wick.
    const candles = withLead(
      [
        [123, 132, 51, 132],
        [132, 132, 102, 117],
      ],
      "rising"
    )
    expect(
      priceActionIndicator.signals?.(candles, only(["bearishEngulfing"]))
    ).toEqual([])
  })

  it("needs the whole Trend before, not most of it", () => {
    const hammer = CASES.find((one) => one.key === "hammer")!
    // Four falling candles make three falls. Asking for four is one too many.
    const candles = withLead(hammer.candles, "falling")
    expect(
      priceActionIndicator.signals?.(
        candles,
        only(["hammer"], { trendBars: 3 })
      )
    ).toHaveLength(1)
    expect(
      priceActionIndicator.signals?.(
        candles,
        only(["hammer"], { trendBars: 4 })
      )
    ).toEqual([])
  })

  it("draws nothing and calls nothing with every switch off", () => {
    const candles = withLead(CASES[0].candles, "falling")
    const params = only([])
    expect(priceActionIndicator.signals?.(candles, params)).toEqual([])
    expect(priceActionIndicator.compute(candles, params, CHART)).toEqual({
      lines: [],
      dashes: [],
      marks: [],
      boxes: [],
    })
  })

  it("starts with only the two engulfing patterns on", () => {
    const defaults = readIndicatorParams(priceActionIndicator.fields, {})
    expect(PATTERN_KEYS.filter((key) => defaults[key] === true)).toEqual([
      "bullishEngulfing",
      "bearishEngulfing",
    ])
    // A hammer on its own says nothing until somebody switches hammers on.
    const hammer = withLead(CASES[1].candles, "falling")
    expect(priceActionIndicator.signals?.(hammer, {})).toEqual([])
    const engulfing = withLead(CASES[0].candles, "falling")
    expect(priceActionIndicator.signals?.(engulfing, {})).toHaveLength(1)
  })

  it("draws only the pattern that is switched on", () => {
    // A falling run, then a hammer, then a bullish engulfing straight after.
    const candles = candlesOf([
      ...lead(110, "falling"),
      [104, 104, 96, 103.5],
      [103.4, 104, 99, 100],
      [100, 107, 98, 106],
    ])
    const hammerOnly = priceActionIndicator.compute(
      candles,
      only(["hammer"], { trendBars: 1 }),
      CHART
    )
    expect(hammerOnly.marks.map((mark) => mark.time)).toEqual([4 * BAR])
    const engulfingOnly = priceActionIndicator.compute(
      candles,
      only(["bullishEngulfing"], { trendBars: 1 }),
      CHART
    )
    expect(engulfingOnly.marks.map((mark) => mark.time)).toEqual([6 * BAR])
  })

  it("boxes a pattern longer than one candle over the candles it covers", () => {
    const star = CASES.find((one) => one.key === "morningStar")!
    const candles = withLead(star.candles, "falling")
    const paint = priceActionIndicator.compute(
      candles,
      only(["morningStar"]),
      CHART
    )
    expect(paint.boxes).toEqual([
      {
        fromTime: 4 * BAR,
        toTime: 7 * BAR,
        price: { high: 105, low: 97.5 },
      },
    ])
  })

  it("draws no box for a one candle pattern", () => {
    const candles = withLead(CASES[1].candles, "falling")
    expect(
      priceActionIndicator.compute(candles, only(["hammer"]), CHART).boxes
    ).toEqual([])
  })

  it("reports two patterns on one candle as two, not one", () => {
    // A hammer and a hanging man are the same shape. With the trend check off
    // both switched on patterns finish on the same candle.
    const candles = candlesOf([[100_000, 100_000, 98_000, 99_800]])
    const params = only(["hammer", "hangingMan"], { trendBars: 0 })
    expect(priceActionIndicator.signals?.(candles, params)).toEqual([
      { time: 0, side: "buy" },
      { time: 0, side: "sell" },
    ])
    expect(
      priceActionIndicator.compute(candles, params, CHART).marks
    ).toHaveLength(2)
  })

  it("hides the arrows and boxes without stopping the signals", () => {
    const star = CASES.find((one) => one.key === "morningStar")!
    const candles = withLead(star.candles, "falling")
    const params = only(["morningStar"], { showArrows: false })
    expect(priceActionIndicator.compute(candles, params, CHART)).toEqual({
      lines: [],
      dashes: [],
      marks: [],
      boxes: [],
    })
    expect(priceActionIndicator.signals?.(candles, params)).toHaveLength(1)
  })

  it("draws and calls the same candles, every time", () => {
    // A wandering price with every pattern on, so plenty of them print.
    let price = 100
    let seed = 7
    const rows: Row[] = []
    for (let k = 0; k < 400; k += 1) {
      seed = (seed * 16_807) % 2_147_483_647
      const move = ((seed % 1_000) / 1_000 - 0.5) * 4
      const open = price
      const close = price + move
      const reach = ((seed >> 3) % 100) / 50
      rows.push([
        open,
        Math.max(open, close) + reach,
        Math.min(open, close) - reach / 2,
        close,
      ])
      price = close
    }
    const candles = candlesOf(rows)
    const params = only(PATTERN_KEYS, { trendBars: 1 })
    const signals = priceActionIndicator.signals?.(candles, params) ?? []
    const marks = priceActionIndicator.compute(candles, params, CHART).marks

    expect(signals.length).toBeGreaterThan(10)
    expect(
      marks.map((mark) => ({
        time: mark.time,
        side: mark.side === "up" ? "buy" : "sell",
      }))
    ).toEqual(signals)
  })

  it("skips a candle it cannot read rather than guessing its shape", () => {
    const hammer = withLead(CASES[1].candles, "falling")
    const noOpen = hammer.map((candle, index) =>
      index === hammer.length - 1 ? { ...candle, open: undefined } : candle
    )
    expect(priceActionIndicator.signals?.(noOpen, only(["hammer"]))).toEqual([])
    const broken = hammer.map((candle, index) =>
      index === hammer.length - 1 ? { ...candle, open: 200_000 } : candle
    )
    expect(priceActionIndicator.signals?.(broken, only(["hammer"]))).toEqual([])
  })

  it("answers nothing, rather than throwing, on no candles", () => {
    expect(priceActionIndicator.signals?.([], {})).toEqual([])
    expect(priceActionIndicator.compute([], {}, CHART).marks).toEqual([])
  })

  it("reads junk or missing settings as their defaults", () => {
    const read = readIndicatorParams(priceActionIndicator.fields, {
      smallBodyPct: "lots",
      longWickTimes: Number.NaN,
      hammer: "yes",
      showArrows: null,
    })
    expect(read.smallBodyPct).toBe(30)
    expect(read.longWickTimes).toBe(2)
    expect(read.noWickPct).toBe(5)
    expect(read.equalTenths).toBe(1)
    expect(read.trendBars).toBe(3)
    expect(read.hammer).toBe(false)
    expect(read.showArrows).toBe(true)
    expect(() =>
      priceActionIndicator.compute(
        withLead(CASES[0].candles, "falling"),
        "junk" as unknown as IndicatorParams,
        CHART
      )
    ).not.toThrow()
  })

  it("keeps every kind of setting through a save and a reload", () => {
    const saved = indicatorSettingsSchema.parse({
      priceAction: {
        on: true,
        params: {
          hammer: true,
          bearishEngulfing: false,
          smallBodyPct: 45,
          trendBars: 0,
          showArrows: false,
        },
      },
    })
    const reloaded = readIndicatorSettings(JSON.parse(JSON.stringify(saved)))
    expect(reloaded.priceAction.on).toBe(true)
    expect(reloaded.priceAction.params).toMatchObject({
      hammer: true,
      bearishEngulfing: false,
      bullishEngulfing: true,
      smallBodyPct: 45,
      trendBars: 0,
      showArrows: false,
    })
  })

  it("reaches automation through the library once switched on", () => {
    const settings = readIndicatorSettings({ priceAction: { on: true } })
    const candles = withLead(CASES[0].candles, "falling")
    expect(indicatorSignals(settings, candles)).toEqual([
      { time: 5 * BAR, side: "buy" },
    ])
  })

  it("asks a replay for the trend candles plus three", () => {
    expect(priceActionIndicator.warmupBars?.({})).toBe(6)
    expect(priceActionIndicator.warmupBars?.({ trendBars: 0 })).toBe(3)
    expect(priceActionIndicator.warmupBars?.({ trendBars: 10 })).toBe(13)
  })
})
