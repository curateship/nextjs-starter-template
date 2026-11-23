import { describe, expect, it } from "vitest"

import {
  clockText,
  isAwake,
  knownTimeZone,
  localDateKey,
  localMinutes,
  nextWakeAt,
  wakeEndsAt,
} from "./waking"

const EIGHT = 8 * 60
const ELEVEN_PM = 23 * 60

describe("waking hours", () => {
  it("reads the clock in the account's own zone", () => {
    const noonUtc = new Date("2026-10-12T12:00:00Z")
    expect(localMinutes(noonUtc, "UTC")).toBe(12 * 60)
    // Toronto is four hours behind in October.
    expect(localMinutes(noonUtc, "America/Toronto")).toBe(8 * 60)
    expect(localDateKey(new Date("2026-10-12T02:00:00Z"), "America/Toronto")).toBe("2026-10-11")
  })

  it("wakes an account behind a German proxy at German morning", () => {
    // 6:30 UTC is 8:30 in Berlin and 2:30 in Toronto.
    const at = new Date("2026-10-12T06:30:00Z")
    expect(isAwake(at, "Europe/Berlin", EIGHT, ELEVEN_PM)).toBe(true)
    expect(isAwake(at, "America/Toronto", EIGHT, ELEVEN_PM)).toBe(false)
  })

  it("says when a sleeping account wakes, and nothing while it is awake", () => {
    const night = new Date("2026-10-12T07:00:00Z") // 3:00 in Toronto
    expect(nextWakeAt(night, "America/Toronto", EIGHT, ELEVEN_PM)?.toISOString()).toBe(
      "2026-10-12T12:00:00.000Z"
    )
    const late = new Date("2026-10-13T03:30:00Z") // 23:30 in Toronto
    expect(nextWakeAt(late, "America/Toronto", EIGHT, ELEVEN_PM)?.toISOString()).toBe(
      "2026-10-13T12:00:00.000Z"
    )
    expect(nextWakeAt(new Date("2026-10-12T15:00:00Z"), "America/Toronto", EIGHT, ELEVEN_PM)).toBeNull()
  })

  it("lets waking hours run past midnight", () => {
    const tenPm = 22 * 60
    const twoAm = 2 * 60
    expect(isAwake(new Date("2026-10-12T23:30:00Z"), "UTC", tenPm, twoAm)).toBe(true)
    expect(isAwake(new Date("2026-10-13T01:30:00Z"), "UTC", tenPm, twoAm)).toBe(true)
    expect(isAwake(new Date("2026-10-13T03:00:00Z"), "UTC", tenPm, twoAm)).toBe(false)
  })

  it("lands on the right hour across the night the clocks go back", () => {
    // Toronto goes from 2:00 back to 1:00 on 1 Nov 2026. At 23:30 on 31 Oct
    // (3:30 UTC) the next 8:00 is 13:00 UTC, not 12:00.
    const wakes = nextWakeAt(new Date("2026-11-01T03:30:00Z"), "America/Toronto", EIGHT, ELEVEN_PM)
    expect(wakes?.toISOString()).toBe("2026-11-01T13:00:00.000Z")
    expect(localMinutes(wakes!, "America/Toronto")).toBe(EIGHT)
  })

  it("says when the stretch an account is awake in ends", () => {
    const at = new Date("2026-10-12T15:00:00Z") // 11:00 in Toronto
    expect(wakeEndsAt(at, "America/Toronto", ELEVEN_PM).toISOString()).toBe("2026-10-13T03:00:00.000Z")
  })

  it("falls back to UTC for a zone nobody knows, rather than throwing", () => {
    expect(knownTimeZone("Not/AZone")).toBe("UTC")
    expect(knownTimeZone(null)).toBe("UTC")
    expect(localMinutes(new Date("2026-10-12T09:15:00Z"), "Not/AZone")).toBe(9 * 60 + 15)
  })

  it("writes a time the way a clock does", () => {
    expect(clockText(EIGHT)).toBe("8:00")
    expect(clockText(23 * 60 + 5)).toBe("23:05")
  })
})
