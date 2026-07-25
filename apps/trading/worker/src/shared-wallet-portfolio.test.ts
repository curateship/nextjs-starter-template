import { describe, expect, it } from "vitest"

import { SharedWalletPortfolio } from "./shared-wallet-portfolio"

describe("shared wallet exposure", () => {
  it("reserves the best respected simultaneous market and releases capacity", () => {
    const portfolio = new SharedWalletPortfolio(25)
    portfolio.submit({
      market: "LOW",
      candleTime: 100,
      exposurePct: 25,
      respectRate: 60,
      volumeMultiple: 5,
      dailyVolumeUsd: 50_000_000,
    })
    portfolio.submit({
      market: "HIGH",
      candleTime: 100,
      exposurePct: 25,
      respectRate: 80,
      volumeMultiple: 2,
      dailyVolumeUsd: 10_000_000,
    })

    expect(portfolio.reserve("LOW", 100, 25)).toBe(false)
    expect(portfolio.reserve("HIGH", 100, 25)).toBe(true)
    expect(portfolio.reservedPct()).toBe(25)
    portfolio.release("HIGH")
    expect(portfolio.reservedPct()).toBe(0)
  })

  it("waits for every live market before ranking the candle", () => {
    const portfolio = new SharedWalletPortfolio(25, ["LOW", "HIGH"])
    portfolio.submit({
      market: "LOW",
      candleTime: 100,
      exposurePct: 25,
      respectRate: 60,
      volumeMultiple: 5,
      dailyVolumeUsd: 50_000_000,
    })
    portfolio.observe("LOW", 100)

    expect(portfolio.ready(100)).toBe(false)
    expect(portfolio.reserve("LOW", 100, 25)).toBe(false)

    portfolio.submit({
      market: "HIGH",
      candleTime: 100,
      exposurePct: 25,
      respectRate: 80,
      volumeMultiple: 2,
      dailyVolumeUsd: 10_000_000,
    })
    portfolio.observe("HIGH", 100)

    expect(portfolio.ready(100)).toBe(true)
    expect(portfolio.reserve("LOW", 100, 25)).toBe(false)
    expect(portfolio.reserve("HIGH", 100, 25)).toBe(true)
  })
})
