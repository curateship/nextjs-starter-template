import { describe, expect, it } from "vitest"

import {
  createUploadSpeedMeter,
  speedText,
  timeLeftText,
} from "@/lib/media/upload-speed"

const MB = 1024 * 1024

describe("upload speed", () => {
  it("has no speed until two seconds have been measured", () => {
    const meter = createUploadSpeedMeter()
    meter.record(0, 0)
    expect(meter.bytesPerSecond()).toBeNull()
    meter.record(1_000, MB)
    expect(meter.bytesPerSecond()).toBeNull()
    meter.record(2_000, 2 * MB)
    expect(meter.bytesPerSecond()).toBe(MB)
  })

  it("reads a steady rate when the pieces land in bursts", () => {
    // 1MB a second, but reported as 4MB every 4 seconds, the way four
    // pieces landing together look.
    const meter = createUploadSpeedMeter()
    for (let second = 0; second <= 60; second += 4) {
      meter.record(second * 1000, second * MB)
    }
    expect(meter.bytesPerSecond()).toBeCloseTo(MB, 0)
  })

  it("follows a change of speed within the 30 seconds, not since the start", () => {
    const meter = createUploadSpeedMeter()
    let bytes = 0
    // Ten minutes at 1MB a second, then a minute at 4MB a second.
    for (let second = 0; second <= 600; second += 1) {
      meter.record(second * 1000, bytes)
      bytes += MB
    }
    for (let second = 601; second <= 660; second += 1) {
      bytes += 4 * MB
      meter.record(second * 1000, bytes)
    }
    expect(meter.bytesPerSecond()).toBeCloseTo(4 * MB, 0)
  })

  it("forgets the readings on reset, so a pause does not read as slow", () => {
    const meter = createUploadSpeedMeter()
    meter.record(0, 0)
    meter.record(10_000, 10 * MB)
    meter.reset()
    meter.record(70_000, 10 * MB)
    expect(meter.bytesPerSecond()).toBeNull()
  })

  it("puts the time left within a minute of the truth on a slow line", () => {
    // A 1GB file over a line that gives 0.5MB a second, measured in bursts.
    const meter = createUploadSpeedMeter()
    const size = 1024 * MB
    for (let second = 0; second <= 120; second += 5) {
      meter.record(second * 1000, second * 0.5 * MB)
    }
    const sent = 120 * 0.5 * MB
    const trueSecondsLeft = (size - sent) / (0.5 * MB)
    const text = timeLeftText(size - sent, meter.bytesPerSecond())
    const minutes = Number(text?.match(/about (\d+) minutes/)?.[1])
    expect(Math.abs(minutes * 60 - trueSecondsLeft)).toBeLessThanOrEqual(60)
  })
})

describe("time left in words", () => {
  it("says nothing without a speed", () => {
    expect(timeLeftText(MB, null)).toBeNull()
    expect(timeLeftText(MB, 0)).toBeNull()
  })

  it("rounds the way a person says it", () => {
    expect(timeLeftText(30 * MB, MB)).toBe("less than a minute left")
    expect(timeLeftText(70 * MB, MB)).toBe("about a minute left")
    expect(timeLeftText(18 * 60 * MB, MB)).toBe("about 18 minutes left")
    expect(timeLeftText(3 * 3600 * MB, MB)).toBe("about 3 hours left")
  })

  it("writes the speed in megabytes a second", () => {
    expect(speedText(null)).toBeNull()
    expect(speedText(2.5 * MB)).toBe("2.5 MB/s")
    expect(speedText(42.4 * MB)).toBe("42 MB/s")
  })
})
