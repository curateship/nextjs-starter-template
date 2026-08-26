import { describe, expect, it } from "vitest"

import { toLighterFundingRates } from "@/server/protocols/lighter/funding"

const HOUR_MS = 3_600_000

describe("Lighter funding rows", () => {
  it("reads seconds, percents and directions into the shared shape", () => {
    // Saved mainnet BTC rows from 26 Aug 2026, plus an invented short hour:
    // Lighter states the rate unsigned and says who paid in `direction`.
    const rates = toLighterFundingRates(
      {
        code: 200,
        fundings: [
          {
            timestamp: 1_787_749_200,
            value: "0.93978360",
            rate: "0.0012",
            direction: "long",
          },
          {
            timestamp: 1_787_752_800,
            value: "0.94137960",
            rate: "0.0007",
            direction: "short",
          },
          { timestamp: 1_787_756_400, rate: "nonsense", direction: "long" },
        ],
      },
      0,
      Number.MAX_SAFE_INTEGER
    )

    expect(rates.map((one) => one.time)).toEqual([
      1_787_749_200_000, 1_787_752_800_000,
    ])
    expect(rates[0].rate).toBeCloseTo(0.000_012, 9)
    expect(rates[1].rate).toBeCloseTo(-0.000_007, 9)
  })

  it("keeps one row per hour and only inside the asked window", () => {
    const hour = 1_787_749_200_000
    const rates = toLighterFundingRates(
      {
        fundings: [
          { timestamp: hour / 1_000, rate: "0.0012", direction: "long" },
          { timestamp: hour / 1_000 + 2, rate: "0.0015", direction: "long" },
          {
            timestamp: (hour - HOUR_MS) / 1_000,
            rate: "0.0010",
            direction: "long",
          },
        ],
      },
      hour,
      hour + HOUR_MS
    )
    expect(rates).toHaveLength(1)
    expect(rates[0].time).toBe(hour)
  })
})
