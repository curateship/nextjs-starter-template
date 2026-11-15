import { describe, expect, it } from "vitest"

import { startTickDue } from "@/lib/pomodoro/room-countdown"

describe("startTickDue", () => {
  it("ticks each new second from 10 down to 1", () => {
    expect(startTickDue(null, 10)).toBe(true)
    expect(startTickDue(10, 9)).toBe(true)
    expect(startTickDue(2, 1)).toBe(true)
  })

  it("stays quiet above 10 seconds, at 0 and with no countdown", () => {
    expect(startTickDue(null, 11)).toBe(false)
    expect(startTickDue(1, 0)).toBe(false)
    expect(startTickDue(null, null)).toBe(false)
  })

  it("never ticks the same second twice", () => {
    expect(startTickDue(4, 4)).toBe(false)
  })

  it("ticks once on waking with a few seconds left", () => {
    expect(startTickDue(null, 3)).toBe(true)
  })
})
