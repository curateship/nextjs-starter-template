import { describe, expect, it } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import { toHeikinAshi } from "@/lib/trade/heikin-ashi"

describe("Heikin-Ashi candles", () => {
  it("matches a hand-computed sequence and keeps real time and volume", () => {
    const candles: CandleBar[] = [
      {
        openTime: 1_000,
        open: 100,
        high: 112,
        low: 96,
        close: 108,
        volume: 14,
      },
      {
        openTime: 2_000,
        open: 108,
        high: 116,
        low: 102,
        close: 104,
        volume: 21,
      },
      {
        openTime: 3_000,
        open: 104,
        high: 107,
        low: 91,
        close: 94,
        volume: 34,
      },
    ]

    expect(toHeikinAshi(candles)).toEqual([
      {
        openTime: 1_000,
        open: 104,
        high: 112,
        low: 96,
        close: 104,
        volume: 14,
      },
      {
        openTime: 2_000,
        open: 104,
        high: 116,
        low: 102,
        close: 107.5,
        volume: 21,
      },
      {
        openTime: 3_000,
        open: 105.75,
        high: 107,
        low: 91,
        close: 99,
        volume: 34,
      },
    ])
  })

  it("returns an empty sequence when there are no candles", () => {
    expect(toHeikinAshi([])).toEqual([])
  })
})
