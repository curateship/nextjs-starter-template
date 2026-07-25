import { describe, expect, it } from "vitest"

import { blendCurves } from "./portfolio-metrics"

describe("backtest portfolio curve", () => {
  it("counts shared QFL capital once and combines each market's change", () => {
    const blended = blendCurves([
      {
        start: 100,
        sharedAccount: true,
        curve: [
          { t: 0, eq: 100 },
          { t: 1, eq: 110 },
        ],
      },
      {
        start: 100,
        sharedAccount: true,
        curve: [
          { t: 0, eq: 100 },
          { t: 1, eq: 90 },
        ],
      },
    ])

    expect(blended).toEqual({
      totalStart: 100,
      series: [
        { t: 0, total: 100 },
        { t: 1, total: 100 },
      ],
    })
  })

  it("sums capital for independent-wallet markets (each its own pot)", () => {
    const blended = blendCurves([
      { start: 100, curve: [{ t: 0, eq: 100 }, { t: 1, eq: 110 }] },
      { start: 100, curve: [{ t: 0, eq: 100 }, { t: 1, eq: 90 }] },
    ])
    // Two separate $100 wallets → $200 base, and the curve sums both balances.
    expect(blended).toEqual({
      totalStart: 200,
      series: [
        { t: 0, total: 200 },
        { t: 1, total: 200 },
      ],
    })
  })
})
