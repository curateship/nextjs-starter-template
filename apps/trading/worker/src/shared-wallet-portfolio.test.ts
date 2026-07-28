import { describe, expect, it } from "vitest"

import { SharedWalletPortfolio } from "./shared-wallet-portfolio"

describe("shared wallet exposure", () => {
  it("reserves the strongest simultaneous market and releases capacity", () => {
    const portfolio = new SharedWalletPortfolio(25)
    portfolio.submit({
      market: "LOW",
      candleTime: 100,
      exposurePct: 25,
      volumeMultiple: 2,
      dailyVolumeUsd: 10_000_000,
    })
    portfolio.submit({
      market: "HIGH",
      candleTime: 100,
      exposurePct: 25,
      volumeMultiple: 5,
      dailyVolumeUsd: 50_000_000,
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
      volumeMultiple: 2,
      dailyVolumeUsd: 10_000_000,
    })
    portfolio.observe("LOW", 100)

    expect(portfolio.ready(100)).toBe(false)
    expect(portfolio.reserve("LOW", 100, 25)).toBe(false)

    portfolio.submit({
      market: "HIGH",
      candleTime: 100,
      exposurePct: 25,
      volumeMultiple: 5,
      dailyVolumeUsd: 50_000_000,
    })
    portfolio.observe("HIGH", 100)

    expect(portfolio.ready(100)).toBe(true)
    expect(portfolio.reserve("LOW", 100, 25)).toBe(false)
    expect(portfolio.reserve("HIGH", 100, 25)).toBe(true)
  })
})

describe("shared wallet usage over time", () => {
  it("weights the average by bars, not by events", () => {
    const portfolio = new SharedWalletPortfolio(100)
    // One bar flat, then three bars with the whole wallet committed.
    portfolio.sample()
    portfolio.setExposure("A", 100)
    portfolio.sample()
    portfolio.sample()
    portfolio.sample()

    expect(portfolio.peakReservedPct()).toBe(100)
    expect(portfolio.avgReservedPct()).toBe(75)
  })

  it("reads zero before any bar has been sampled", () => {
    const portfolio = new SharedWalletPortfolio(100)
    expect(portfolio.avgReservedPct()).toBe(0)
    expect(portfolio.barsAtPeak()).toBe(0)
  })

  it("counts time at the peak against the run's final high-water mark", () => {
    const portfolio = new SharedWalletPortfolio(100)
    // Two bars at 40 look like the peak while they happen, but a later bar at
    // 80 takes that title — so only the 80 bar counts as time at the peak.
    portfolio.setExposure("A", 40)
    portfolio.sample()
    portfolio.sample()
    portfolio.setExposure("A", 80)
    portfolio.sample()
    portfolio.setExposure("A", 10)
    portfolio.sample()

    expect(portfolio.peakReservedPct()).toBe(80)
    expect(portfolio.barsAtPeak()).toBe(1)
  })

  it("counts a bar near the peak, but not one well below it", () => {
    const portfolio = new SharedWalletPortfolio(100)
    portfolio.setExposure("A", 100)
    portfolio.sample()
    // 95 is inside the band around 100; 85 is not.
    portfolio.setExposure("A", 95)
    portfolio.sample()
    portfolio.setExposure("A", 85)
    portfolio.sample()
    portfolio.setExposure("A", 5)
    portfolio.sample()

    expect(portfolio.barsAtPeak()).toBe(2)
  })

  it("reports no time at the peak on a wallet that never deployed", () => {
    const portfolio = new SharedWalletPortfolio(100)
    portfolio.sample()
    portfolio.sample()

    expect(portfolio.peakReservedPct()).toBe(0)
    expect(portfolio.barsAtPeak()).toBe(0)
  })

  it("reports no time at a peak that came and went inside one bar", () => {
    const portfolio = new SharedWalletPortfolio(100)
    // The wallet touches 90 and is released before the bar is ever sampled.
    portfolio.setExposure("A", 90)
    portfolio.setExposure("A", 10)
    portfolio.sample()

    expect(portfolio.peakReservedPct()).toBe(90)
    expect(portfolio.barsAtPeak()).toBe(0)
  })
})
