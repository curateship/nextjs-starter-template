import { describe, expect, it } from "vitest"

import { candleIntervalMs, reconnectDelay } from "@/lib/protocols/timing"

describe("shared protocol timing", () => {
  it("keeps the reconnect wait capped at thirty seconds", () => {
    expect(reconnectDelay(0)).toBe(1_000)
    expect(reconnectDelay(2)).toBe(5_000)
    expect(reconnectDelay(99)).toBe(30_000)
  })

  it("allows an exchange to supply a different reconnect schedule", () => {
    expect(reconnectDelay(1, [250, 750])).toBe(750)
    expect(reconnectDelay(10, [250, 750])).toBe(750)
  })

  it("maps every app candle interval once", () => {
    expect(candleIntervalMs("1m")).toBe(60_000)
    expect(candleIntervalMs("4h")).toBe(14_400_000)
    expect(candleIntervalMs("1d")).toBe(86_400_000)
  })
})
