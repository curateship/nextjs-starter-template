import { describe, expect, it } from "vitest"

import {
  detectPriceAction,
  priceActionOptionsFromParams,
  type PriceActionOptions,
} from "./price-action"

const bar = (o: number, h: number, l: number, c: number) => ({ o, h, l, c })

function options(
  patch: Partial<PriceActionOptions> = {}
): PriceActionOptions {
  return {
    bullHammer: false,
    bearShootingStar: false,
    bullEngulfing: false,
    bearEngulfing: false,
    bullSweep: false,
    bearSweep: false,
    bullBos: false,
    bearBos: false,
    wickBodyRatio: 2,
    extremeLookback: 2,
    sweepLookback: 3,
    swingLookback: 1,
    maxSignals: 300,
    ...patch,
  }
}

describe("detectPriceAction", () => {
  it("confirms a green hammer with two green candles and enters on candle four", () => {
    const bullish = [
      bar(10, 11, 9, 10),
      bar(10, 11, 9, 10),
      bar(9, 9.6, 7, 9.5),
      bar(9.5, 10.2, 9.4, 10),
      bar(10, 10.7, 9.9, 10.5),
      bar(10.5, 11, 10.4, 10.8),
    ]
    expect(
      detectPriceAction(bullish, options({ bullHammer: true }))
    ).toEqual([{ index: 5, side: "bull", pattern: "hammer" }])

    const bearish = [
      bar(10, 11, 9, 10),
      bar(10, 11, 9, 10),
      bar(10.5, 13, 10.4, 10),
      bar(10, 10.1, 9.2, 9.5),
      bar(9.5, 9.6, 8.8, 9),
      bar(9, 9.1, 8.5, 8.8),
    ]
    expect(
      detectPriceAction(bearish, options({ bearShootingStar: true }))
    ).toEqual([{ index: 5, side: "bear", pattern: "shootingStar" }])

    const notExtreme = [
      ...bullish.slice(0, 2),
      bar(9.5, 10, 9.2, 9.9),
      bar(9.9, 10.3, 9.8, 10.2),
      bar(10.2, 10.8, 10.1, 10.6),
      bar(10.6, 11, 10.5, 10.8),
    ]
    expect(
      detectPriceAction(notExtreme, options({ bullHammer: true }))
    ).toEqual([])
  })

  it("requires a bullish hammer candle and handles dojis safely", () => {
    expect(
      detectPriceAction(
        [bar(10, 11, 9, 10), bar(10, 11, 9, 10), bar(10, 10, 10, 10)],
        options({ bullHammer: true })
      )
    ).toEqual([])
    expect(
      detectPriceAction(
        [
          bar(10, 11, 9, 10),
          bar(10, 11, 9, 10),
          bar(10, 10.1, 7, 10),
          bar(10, 10.3, 9.8, 10.2),
          bar(10.2, 10.6, 10.1, 10.4),
          bar(10.4, 10.8, 10.3, 10.6),
        ],
        options({ bullHammer: true })
      )
    ).toEqual([])
  })

  it("detects strict body engulfings and rejects wick-only or same-color pairs", () => {
    const base = [bar(10, 10.5, 9.5, 10), bar(10, 10.5, 9.5, 10)]
    const bullish = [...base, bar(10, 10.1, 9, 9.2), bar(9, 10.3, 8.5, 10.2)]
    expect(
      detectPriceAction(bullish, options({ bullEngulfing: true }))
    ).toEqual([{ index: 3, side: "bull", pattern: "bullishEngulfing" }])

    const wickOnly = [...base, bar(10, 10.5, 9, 9.2), bar(9.3, 10.5, 8.5, 9.9)]
    const sameColor = [...base, bar(9.2, 10.1, 9, 10), bar(9, 10.3, 8.5, 10.2)]
    expect(
      detectPriceAction(wickOnly, options({ bullEngulfing: true }))
    ).toEqual([])
    expect(
      detectPriceAction(sameColor, options({ bullEngulfing: true }))
    ).toEqual([])

    const bearish = [
      ...base,
      bar(9, 10.1, 8.9, 10),
      bar(10.2, 10.6, 8.7, 8.8),
    ]
    expect(
      detectPriceAction(bearish, options({ bearEngulfing: true }))
    ).toEqual([{ index: 3, side: "bear", pattern: "bearishEngulfing" }])
  })

  it("detects mirrored liquidity sweeps at strict boundaries", () => {
    const prior = [bar(10, 11, 9, 10), bar(10, 12, 8, 10), bar(10, 11, 9, 10)]
    expect(
      detectPriceAction(
        [...prior, bar(9, 10, 7, 8.5)],
        options({ bullSweep: true })
      )
    ).toEqual([{ index: 3, side: "bull", pattern: "liquiditySweepLow" }])
    expect(
      detectPriceAction(
        [...prior, bar(9, 10, 8, 9)],
        options({ bullSweep: true })
      )
    ).toEqual([])
    expect(
      detectPriceAction(
        [...prior, bar(9, 10, 7, 8)],
        options({ bullSweep: true })
      )
    ).toEqual([])
    expect(
      detectPriceAction(
        [...prior, bar(11, 13, 10, 11.5)],
        options({ bearSweep: true })
      )
    ).toEqual([{ index: 3, side: "bear", pattern: "liquiditySweepHigh" }])
  })

  it("fires a break of structure only once per confirmed swing level", () => {
    const candles = [
      bar(8, 9, 7, 8),
      bar(9, 12, 8, 10),
      bar(9, 10, 7, 9),
      bar(11, 13, 10, 12.5),
      bar(12, 14, 11, 13),
      bar(12, 13, 10, 12),
      bar(14, 15, 12, 14.5),
    ]
    const signals = detectPriceAction(candles, options({ bullBos: true }))
    expect(signals.filter((signal) => signal.pattern === "breakOfStructureUp"))
      .toEqual([
        { index: 3, side: "bull", pattern: "breakOfStructureUp" },
        { index: 6, side: "bull", pattern: "breakOfStructureUp" },
      ])

    const mirrored = candles.map((candle) =>
      bar(-candle.o, -candle.l, -candle.h, -candle.c)
    )
    expect(
      detectPriceAction(mirrored, options({ bearBos: true })).filter(
        (signal) => signal.pattern === "breakOfStructureDown"
      )
    ).toEqual([
      { index: 3, side: "bear", pattern: "breakOfStructureDown" },
      { index: 6, side: "bear", pattern: "breakOfStructureDown" },
    ])
  })

  it("honors toggles, caps output, and maps stored params", () => {
    const candles = [
      bar(10, 11, 9, 10),
      bar(10, 11, 9, 10),
      bar(9, 9.6, 7, 9.5),
      bar(9.5, 10.2, 9.4, 10),
      bar(10, 10.7, 9.9, 10.5),
      bar(10.5, 11, 10.4, 10.8),
    ]
    expect(detectPriceAction(candles, options())).toEqual([])
    expect(
      detectPriceAction(
        candles,
        options({ bullHammer: true, maxSignals: 1 })
      )
    ).toHaveLength(1)
    expect(
      detectPriceAction(
        candles,
        options({ bullHammer: true, maxSignals: 0 })
      )
    ).toEqual([])

    expect(
      priceActionOptionsFromParams({ bullHammer: 0, wickBodyRatio: 3 })
    ).toMatchObject({ bullHammer: false, bearSweep: true, wickBodyRatio: 3 })
  })

  it("is causal for every completed prefix", () => {
    const candles = [
      bar(10, 11, 9, 10),
      bar(10, 12, 8, 10),
      bar(10, 11, 9, 10),
      bar(9, 10, 7, 8.5),
      bar(9, 11, 8, 10),
      bar(10, 13, 9, 12),
    ]
    const config = options({ bullSweep: true, bearSweep: true, bullBos: true })
    const full = detectPriceAction(candles, config)
    for (let end = 1; end <= candles.length; end += 1) {
      expect(detectPriceAction(candles.slice(0, end), config)).toEqual(
        full.filter((signal) => signal.index < end)
      )
    }
  })
})
