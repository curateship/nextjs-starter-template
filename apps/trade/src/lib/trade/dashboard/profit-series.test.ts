import { describe, expect, it } from "vitest"

import {
  filterTradingOverviewProfitSeries,
  mergeTradingOverviewProfitSeries,
} from "./profit-series"

describe("the combined profit graph", () => {
  it("carries each wallet through fill times that belong to another wallet", () => {
    expect(
      mergeTradingOverviewProfitSeries([
        {
          key: "first",
          points: [
            { at: 1, money: 0 },
            { at: 3, money: 5 },
          ],
        },
        {
          key: "second",
          points: [
            { at: 1, money: 0 },
            { at: 2, money: -2 },
            { at: 4, money: 1 },
          ],
        },
      ])
    ).toEqual([
      { at: 1, first: 0, second: 0 },
      { at: 2, first: 0, second: -2 },
      { at: 3, first: 5, second: -2 },
      { at: 4, first: 5, second: 1 },
    ])
  })

  it("keeps the last known result at both edges of a filtered range", () => {
    expect(
      filterTradingOverviewProfitSeries(
        [
          { at: 1, total: 0 },
          { at: 3, total: 5 },
          { at: 7, total: -2 },
        ],
        2,
        6
      )
    ).toEqual([
      { at: 2, total: 0 },
      { at: 3, total: 5 },
      { at: 6, total: 5 },
    ])
  })

  it("returns no chart when the chosen dates are outside recorded history", () => {
    expect(
      filterTradingOverviewProfitSeries([{ at: 3, total: 5 }], 0, 2)
    ).toEqual([])
    expect(
      filterTradingOverviewProfitSeries([{ at: 3, total: 5 }], 4, 6)
    ).toEqual([])
  })
})
