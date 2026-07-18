import { describe, expect, it } from "vitest"

import { formatSleepRemaining, SLEEP_TIMER_PRESETS } from "@/lib/sleep-timer"

describe("sleep timer", () => {
  it("offers the 15/30/60 minute presets", () => {
    expect(SLEEP_TIMER_PRESETS).toEqual([15, 30, 60])
  })

  it("formats remaining time as m:ss, rounding up", () => {
    expect(formatSleepRemaining(60_000)).toBe("1:00")
    expect(formatSleepRemaining(59_400)).toBe("1:00")
    expect(formatSleepRemaining(1_500)).toBe("0:02")
    expect(formatSleepRemaining(15 * 60_000)).toBe("15:00")
  })

  it("never renders negative time", () => {
    expect(formatSleepRemaining(0)).toBe("0:00")
    expect(formatSleepRemaining(-5_000)).toBe("0:00")
  })
})
