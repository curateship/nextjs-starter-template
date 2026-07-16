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
})
