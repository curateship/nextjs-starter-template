import { describe, expect, it } from "vitest"

import {
  DEFAULT_TRADING_ZONE,
  clockTimeOfMinutes,
  minutesOfClockTime,
  readTradingZone,
  tradingZoneLabel,
  zoneAxisLabel,
  zoneCrosshairLabel,
  zoneDayKeyOf,
  zoneOffsetMinutes,
  zoneTimeAt,
} from "@/lib/trade/chart-timezone"

/** 21 Aug 2026, 13:30 UTC — summer in New York and in London. */
const SUMMER = Date.UTC(2026, 7, 21, 13, 30)
/** 21 Jan 2026, 13:30 UTC — winter in both. */
const WINTER = Date.UTC(2026, 0, 21, 13, 30)

describe("the chart's timezone", () => {
  it("keeps UTC as itself", () => {
    expect(zoneOffsetMinutes("UTC", SUMMER)).toBe(0)
    expect(zoneTimeAt("UTC", SUMMER).minuteOfDay).toBe(13 * 60 + 30)
  })

  it("shifts a moment by a different amount in summer and in winter", () => {
    // This is the whole reason a zone is stored by name and not as an offset.
    // New York is four hours behind UTC in August and five in January, so a
    // session stored as "13:30 UTC" would be the open for half the year and an
    // hour late for the other half.
    expect(zoneOffsetMinutes("America/New_York", SUMMER)).toBe(-240)
    expect(zoneOffsetMinutes("America/New_York", WINTER)).toBe(-300)
    expect(zoneTimeAt("America/New_York", SUMMER).minuteOfDay).toBe(9 * 60 + 30)
    expect(zoneTimeAt("America/New_York", WINTER).minuteOfDay).toBe(8 * 60 + 30)
  })

  it("puts London an hour ahead of UTC in summer and level with it in winter", () => {
    expect(zoneOffsetMinutes("Europe/London", SUMMER)).toBe(60)
    expect(zoneOffsetMinutes("Europe/London", WINTER)).toBe(0)
  })

  it("reads a zone that is half an hour off the hour", () => {
    // Sydney is a whole number of hours off, but the day-caching underneath
    // works in minutes for the zones that are not.
    expect(zoneOffsetMinutes("Asia/Tokyo", SUMMER)).toBe(540)
    expect(zoneTimeAt("Asia/Tokyo", SUMMER)).toMatchObject({
      year: 2026,
      month: 8,
      day: 21,
      minuteOfDay: 22 * 60 + 30,
    })
  })

  it("is exact on the day the clocks move, not just on the days either side", () => {
    // New York went forward at 07:00 UTC on 8 March 2026. Both of these fall
    // on the same UTC day, which is the day a per-day cache would get wrong.
    const before = Date.UTC(2026, 2, 8, 6, 0)
    const after = Date.UTC(2026, 2, 8, 8, 0)
    expect(zoneOffsetMinutes("America/New_York", before)).toBe(-300)
    expect(zoneOffsetMinutes("America/New_York", after)).toBe(-240)
  })

  it("puts a moment on the local day, not the UTC one", () => {
    // 03:00 UTC on the 22nd is still the evening of the 21st in New York, and
    // that is which session it belongs to.
    const late = Date.UTC(2026, 7, 22, 3, 0)
    expect(zoneDayKeyOf(zoneTimeAt("UTC", late))).toBe(20260822)
    expect(zoneDayKeyOf(zoneTimeAt("America/New_York", late))).toBe(20260821)
  })

  it("gives back a zone it offers, and UTC for anything else", () => {
    expect(readTradingZone("America/New_York")).toBe("America/New_York")
    // A row written by a build that offered a zone this one does not, junk,
    // and nothing at all. A chart that will not draw is worse than a chart on
    // the wrong clock.
    expect(readTradingZone("Mars/Olympus")).toBe(DEFAULT_TRADING_ZONE)
    expect(readTradingZone(7)).toBe(DEFAULT_TRADING_ZONE)
    expect(readTradingZone(undefined)).toBe(DEFAULT_TRADING_ZONE)
  })

  it("calls a zone by its short name, and an unknown one by its own", () => {
    expect(tradingZoneLabel("America/New_York")).toBe("New York")
    expect(tradingZoneLabel("Mars/Olympus")).toBe("Mars/Olympus")
  })
})

describe("clock times", () => {
  it("reads a written time as minutes past midnight", () => {
    expect(minutesOfClockTime("09:30")).toBe(570)
    expect(minutesOfClockTime("00:00")).toBe(0)
    expect(minutesOfClockTime("23:59")).toBe(1_439)
    expect(minutesOfClockTime(" 9:05 ")).toBe(545)
  })

  it("refuses anything that is not a time rather than guessing at one", () => {
    for (const junk of ["", "0930", "24:00", "09:60", "half nine", "9"]) {
      expect(minutesOfClockTime(junk)).toBeNull()
    }
  })

  it("writes minutes back the way they were read", () => {
    expect(clockTimeOfMinutes(570)).toBe("09:30")
    expect(clockTimeOfMinutes(0)).toBe("00:00")
    // Held inside the day rather than wrapping, so a stray number cannot come
    // back looking like a real time on the wrong day.
    expect(clockTimeOfMinutes(-5)).toBe("00:00")
    expect(clockTimeOfMinutes(5_000)).toBe("23:59")
  })
})

describe("what the chart writes on its axis", () => {
  it("labels a moment in whichever shape the chart asked for", () => {
    expect(zoneAxisLabel("UTC", SUMMER, "year")).toBe("2026")
    expect(zoneAxisLabel("UTC", SUMMER, "month")).toBe("Aug")
    expect(zoneAxisLabel("UTC", SUMMER, "day")).toBe("21")
    expect(zoneAxisLabel("UTC", SUMMER, "time")).toBe("13:30")
  })

  it("labels the same moment differently on a different clock", () => {
    expect(zoneAxisLabel("America/New_York", SUMMER, "time")).toBe("09:30")
    expect(zoneCrosshairLabel("America/New_York", SUMMER)).toBe(
      "21 Aug '26 09:30"
    )
  })
})
