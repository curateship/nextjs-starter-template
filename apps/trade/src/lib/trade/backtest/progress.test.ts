import { describe, expect, it } from "vitest"

import {
  backtestMeter,
  COIN_LOADED_PROGRESS,
} from "@/lib/trade/backtest/progress"

describe("a running backtest's progress bar", () => {
  it("counts loaded coins while any coin is still loading", () => {
    // Three loaded, one skipped, one still downloading, one not started.
    const meter = backtestMeter([
      { status: "running", progress: COIN_LOADED_PROGRESS },
      { status: "running", progress: COIN_LOADED_PROGRESS },
      { status: "running", progress: COIN_LOADED_PROGRESS },
      { status: "skipped", progress: 1 },
      { status: "running", progress: 0.1 },
      { status: "waiting", progress: 0 },
    ])
    expect(meter.text).toBe("Loaded 4 of 6 coins")
    expect(meter.value).toBeCloseTo((4 / 6) * COIN_LOADED_PROGRESS)
  })

  it("never fills past where a fully loaded run starts, so it cannot go backwards", () => {
    const nearlyLoaded = [
      ...Array.from({ length: 313 }, () => ({
        status: "running",
        progress: COIN_LOADED_PROGRESS,
      })),
      { status: "waiting", progress: 0 },
    ]
    const loading = backtestMeter(nearlyLoaded)
    const justLoaded = backtestMeter(
      nearlyLoaded.map(() => ({
        status: "running",
        progress: COIN_LOADED_PROGRESS,
      }))
    )
    expect(loading.value).toBeLessThan(justLoaded.value)
    // Averaging 314 of them lands a hair under, which no bar can show.
    expect(justLoaded.value).toBeCloseTo(COIN_LOADED_PROGRESS)
  })

  it("goes back to percent through once every coin is loaded", () => {
    const meter = backtestMeter([
      { status: "running", progress: 0.5 },
      { status: "skipped", progress: 1 },
    ])
    expect(meter).toEqual({ value: 0.75, text: "75% through" })
  })

  it("starts at zero for a run with no coin rows", () => {
    expect(backtestMeter([])).toEqual({ value: 0, text: "0% through" })
  })
})
