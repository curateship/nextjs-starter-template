import { afterEach, describe, expect, it, vi } from "vitest"

import {
  asterFundingIntervalMs,
  fetchAsterFundingIntervals,
  toAsterFundingRates,
} from "@/server/protocols/aster/funding"

describe("Aster funding history", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("keeps each network's interval separate and ignores null intervals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: URL) =>
        Promise.resolve(
          Response.json([
            {
              symbol: "BTCUSDT",
              fundingIntervalHours: String(
                url.hostname.includes("testnet") ? 8 : 1
              ),
            },
            { symbol: "OLDUSDT", fundingIntervalHours: null },
          ])
        )
      )
    )

    const mainnet = await fetchAsterFundingIntervals("mainnet")
    const testnet = await fetchAsterFundingIntervals("testnet")

    expect(mainnet.get("BTCUSDT")).toBe(60 * 60 * 1_000)
    expect(testnet.get("BTCUSDT")).toBe(8 * 60 * 60 * 1_000)
    expect(mainnet.has("OLDUSDT")).toBe(false)
    expect(testnet.has("OLDUSDT")).toBe(false)
    expect(asterFundingIntervalMs("mainnet", "BTCUSDT")).toBe(3_600_000)
    expect(asterFundingIntervalMs("testnet", "BTCUSDT")).toBe(28_800_000)
  })

  it("keeps valid settlements in the requested window", () => {
    const hour = 3_600_000
    expect(
      toAsterFundingRates(
        [
          {
            symbol: "BTCUSDT",
            fundingTime: 2 * hour + 9,
            fundingRate: "0.0002",
          },
          { symbol: "BTCUSDT", fundingTime: hour + 4, fundingRate: "-0.0001" },
          { symbol: "BTCUSDT", fundingTime: 3 * hour, fundingRate: "bad" },
          { symbol: "BTCUSDT", fundingTime: 5 * hour, fundingRate: "0.1" },
        ],
        hour,
        4 * hour
      )
    ).toEqual([
      { time: hour, rate: -0.0001 },
      { time: 2 * hour, rate: 0.0002 },
    ])
  })
})
