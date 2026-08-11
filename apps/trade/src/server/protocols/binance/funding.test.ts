import { afterEach, describe, expect, it, vi } from "vitest"

import {
  binanceFundingIntervalMs,
  fetchBinanceFunding,
  toBinanceFundingRates,
} from "@/server/protocols/binance/funding"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("Binance funding rates", () => {
  it("normalizes small settlement delays, sorts rows, and removes duplicates", () => {
    const hour = 3_600_000
    expect(
      toBinanceFundingRates([
        { fundingTime: 8 * hour + 6, fundingRate: "-0.0002" },
        { fundingTime: 4 * hour + 2, fundingRate: "0.0001" },
        { fundingTime: 8 * hour + 9, fundingRate: "-0.0003" },
      ])
    ).toEqual([
      { time: 4 * hour, rate: 0.0001 },
      { time: 8 * hour, rate: -0.0003 },
    ])
  })

  it("uses Binance's regular eight-hour settlement interval", () => {
    expect(binanceFundingIntervalMs()).toBe(8 * 3_600_000)
  })

  it("keeps extra settlements when Binance shortens the interval", () => {
    const hour = 3_600_000
    expect(
      toBinanceFundingRates([
        { fundingTime: 4 * hour, fundingRate: "0.0001" },
        { fundingTime: 8 * hour, fundingRate: "0.0002" },
      ])
    ).toHaveLength(2)
  })

  it("drops an empty rate instead of turning it into zero", () => {
    expect(
      toBinanceFundingRates([{ fundingTime: 28_800_000, fundingRate: " " }])
    ).toEqual([])
  })

  it("treats a delisted saved market as missing funding", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 400 })))

    await expect(
      fetchBinanceFunding("mainnet", "DELISTED", 0, 1)
    ).resolves.toEqual([])
  })
})
