import { describe, expect, it } from "vitest"

import { blendCurves, tallyOpenPositions } from "./portfolio-metrics"

describe("backtest portfolio curve", () => {
  it("counts the pot once and adds each market's profit to it", () => {
    const blended = blendCurves([
      {
        start: 100,
        curve: [
          { t: 0, eq: 100 },
          { t: 1, eq: 110 },
        ],
      },
      {
        start: 100,
        curve: [
          { t: 0, eq: 100 },
          { t: 1, eq: 90 },
        ],
      },
    ])

    // One $100 pot, +10 from one market and −10 from the other: still $100.
    expect(blended).toEqual({
      totalStart: 100,
      series: [
        { t: 0, total: 100 },
        { t: 1, total: 100 },
      ],
    })
  })

  it("does not shrink a loss by spreading it over more markets", () => {
    // The reported bug: four markets each down $66.105 on a $10,000 pot read
    // as a 0.66% fall, because the base was counted once per market.
    const market = (eq: number) => ({
      start: 10_000,
      curve: [
        { t: 0, eq: 10_000 },
        { t: 1, eq },
      ],
    })
    const blended = blendCurves([
      market(9_933.895),
      market(9_933.895),
      market(9_933.895),
      market(9_933.895),
    ])
    expect(blended?.totalStart).toBe(10_000)
    const end = blended!.series[1].total
    expect(end).toBeCloseTo(9_735.58, 6)
    expect((end / blended!.totalStart - 1) * 100).toBeCloseTo(-2.6442, 6)
  })

  it("holds a market flat at zero profit before its history starts", () => {
    const blended = blendCurves([
      {
        start: 100,
        curve: [
          { t: 0, eq: 100 },
          { t: 2, eq: 120 },
        ],
      },
      { start: 100, curve: [{ t: 2, eq: 90 }] },
    ])
    // At t=0 only the first market has run: the pot is 100, not 200.
    expect(blended?.series[0]).toEqual({ t: 0, total: 100 })
    expect(blended?.series[1]).toEqual({ t: 2, total: 110 })
  })
})

describe("money still open in a run group", () => {
  it("sums the markets still holding, and counts only those", () => {
    expect(
      tallyOpenPositions([
        { openNotionalUsd: 1200 },
        { openNotionalUsd: 0 },
        { openNotionalUsd: 300.5 },
      ])
    ).toEqual({ usd: 1500.5, markets: 2 })
  })

  it("answers a real zero when every market finished flat", () => {
    expect(
      tallyOpenPositions([{ openNotionalUsd: 0 }, { openNotionalUsd: 0 }])
    ).toEqual({ usd: 0, markets: 0 })
  })

  it("answers unknown — not $0 — for a run finished before this was measured", () => {
    // "$0, everything closed" would be a claim about what the markets did.
    // A run with no measurement cannot support it.
    expect(
      tallyOpenPositions([{ openNotionalUsd: null }, { openNotionalUsd: null }])
    ).toBeNull()
  })

  it("uses what a partly-measured group does carry", () => {
    expect(
      tallyOpenPositions([{ openNotionalUsd: null }, { openNotionalUsd: 700 }])
    ).toEqual({ usd: 700, markets: 1 })
  })
})
