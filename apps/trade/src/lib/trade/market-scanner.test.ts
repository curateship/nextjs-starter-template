import { describe, it, expect } from "vitest"
import {
  defaultScannerSettings,
  scannerMatch,
  scannerMovement,
  scannerSettingsSchema,
} from "./market-scanner"
import type { CandleBar } from "@/lib/protocols/contracts"
const settings = {
  ...defaultScannerSettings(),
  mode: "volume" as const,
  interval: "1m" as const,
}
const now = 30 * 60_000
function candles(): CandleBar[] {
  return Array.from({ length: 21 }, (_, i) => ({
    openTime: (i + 10) * 60_000,
    open: 100,
    high: 100.5,
    low: 99.5,
    close: 100,
    volume: 1,
  }))
}
describe("Market scanner measurements", () => {
  it("compares $30,000 with a $10,000 baseline and includes equality", () => {
    const minute = { traded: 30_000, move: 0, fraction: 0 }
    expect(
      scannerMatch({ ...settings, volumeMultiple: 3 }, 14_400_000, minute, null)
        .matches
    ).toBe(true)
    expect(
      scannerMatch({ ...settings, volumeMultiple: 4 }, 14_400_000, minute, null)
        .matches
    ).toBe(false)
    expect(
      scannerMatch(
        { ...settings, volumeMultiple: 3, minimumVolumeUsd: 30_001 },
        14_400_000,
        minute,
        null
      ).matches
    ).toBe(false)
    for (const volume of [0, NaN, Infinity, -1])
      expect(scannerMatch(settings, volume, minute, null).matches).toBe(false)
  })
  it("excludes the forming $3 candle from the $1 ATR baseline", () => {
    const bars = candles()
    bars[20] = { ...bars[20], high: 102, low: 99, close: 101 }
    const movement = scannerMovement(bars, settings, now)!
    expect(movement.atr).toBe(1)
    expect(movement.range).toBe(3)
    expect(movement.multiple).toBe(3)
    expect(movement.rangeFraction).toBeCloseTo(3 / 101)
    expect(movement.atrFraction).toBeCloseTo(1 / 101)
    expect(movement.change).toBeCloseTo(0.01)
    expect(movement.bandWidth).toBeCloseTo((4 * Math.sqrt(0.0475)) / 100.05)
    expect(
      scannerMatch(
        { ...settings, mode: "volatility", volatilityMultiple: 2 },
        0,
        null,
        movement
      ).matches
    ).toBe(true)
    expect(
      scannerMatch(
        { ...settings, mode: "volatility", volatilityMultiple: 4 },
        0,
        null,
        movement
      ).matches
    ).toBe(false)
    expect(
      scannerMatch({ ...settings, mode: "both" }, 0, null, movement).matches
    ).toBe(false)
    expect(
      scannerMatch(
        { ...settings, mode: "both" },
        1440,
        { traded: 10_000, move: 0, fraction: 0 },
        movement
      ).matches
    ).toBe(true)
    expect(
      scannerMatch(
        { ...settings, enabled: false, mode: "volatility" },
        0,
        null,
        movement
      ).matches
    ).toBe(false)
  })
  it("rejects stale, incomplete, gapped, invalid and flat candle history", () => {
    expect(scannerMovement(candles(), settings, now + 60_000)).toBeNull()
    expect(scannerMovement(candles().slice(1), settings, now)).toBeNull()
    const gap = candles()
    gap.splice(10, 1)
    expect(scannerMovement(gap, settings, now)).toBeNull()
    const invalid = candles()
    invalid[10].close = NaN
    expect(scannerMovement(invalid, settings, now)).toBeNull()
    expect(
      scannerMovement(
        candles().map((bar) => ({ ...bar, high: 100, low: 100 })),
        settings,
        now
      )
    ).toBeNull()
  })
  it("validates the settings boundary", () => {
    expect(scannerSettingsSchema.safeParse(settings).success).toBe(true)
    for (const patch of [
      { exchanges: [] },
      { atrPeriod: 1 },
      { atrPeriod: 2.5 },
      { volumeMultiple: Infinity },
      { interval: "2m" },
      { minimumVolumeUsd: -1 },
    ]) {
      expect(
        scannerSettingsSchema.safeParse({ ...settings, ...patch }).success
      ).toBe(false)
    }
  })
})

it("matches a rolling 5% rise without volume or candle conditions", async () => {
  const { scannerPriceMatches } = await import("./market-scanner")
  const rule = defaultScannerSettings()
  expect(
    scannerPriceMatches(rule, { fraction: 0.05, move: 5, traded: 0 })
  ).toBe(true)
  expect(
    scannerPriceMatches(rule, { fraction: 0.0499, move: 4.99, traded: 1e9 })
  ).toBe(false)
  expect(
    scannerPriceMatches(rule, { fraction: -0.05, move: -5, traded: 0 })
  ).toBe(false)
  expect(scannerPriceMatches(rule, null)).toBe(false)
  expect(scannerPriceMatches(rule, { fraction: NaN, move: 0, traded: 0 })).toBe(
    false
  )
})
