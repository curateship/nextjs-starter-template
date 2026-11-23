import { describe, expect, it } from "vitest"

import {
  describeWeekdaySet,
  EVERY_DAY,
  isValidWeekdaySet,
  repeatsOnLocalDate,
  toggleWeekdayInSet,
  weekdayOfLocalDate,
  weekdaySetHas,
  WEEKDAYS_MON_TO_FRI,
} from "@/lib/pomodoro/task-repeats"

/**
 * The day maths behind a repeat. It runs on `yyyy-mm-dd` strings that the
 * server has already worked out in the person's own timezone, so no test here
 * needs a clock or timezone data.
 *
 * 21 September 2026 is a Monday and 26 September 2026 is the Saturday of that
 * week; both are used throughout so the dates read the same way each time.
 */

describe("weekdayOfLocalDate", () => {
  it("names the weekday, Sunday as 0", () => {
    expect(weekdayOfLocalDate("2026-09-20")).toBe(0)
    expect(weekdayOfLocalDate("2026-09-21")).toBe(1)
    expect(weekdayOfLocalDate("2026-09-26")).toBe(6)
  })

  it("refuses anything that is not a real calendar day", () => {
    expect(weekdayOfLocalDate("2026-02-30")).toBe(null)
    expect(weekdayOfLocalDate("2026-13-01")).toBe(null)
    expect(weekdayOfLocalDate("not a date")).toBe(null)
  })
})

describe("isValidWeekdaySet", () => {
  it("accepts one day through all seven", () => {
    expect(isValidWeekdaySet(1)).toBe(true)
    expect(isValidWeekdaySet(EVERY_DAY)).toBe(true)
  })

  it("refuses no days, too many bits and non-integers", () => {
    expect(isValidWeekdaySet(0)).toBe(false)
    expect(isValidWeekdaySet(128)).toBe(false)
    expect(isValidWeekdaySet(2.5)).toBe(false)
    expect(isValidWeekdaySet("3")).toBe(false)
  })
})

describe("weekdaySetHas and toggleWeekdayInSet", () => {
  it("has Monday to Friday and not the weekend", () => {
    expect(weekdaySetHas(WEEKDAYS_MON_TO_FRI, 0)).toBe(false)
    expect(weekdaySetHas(WEEKDAYS_MON_TO_FRI, 1)).toBe(true)
    expect(weekdaySetHas(WEEKDAYS_MON_TO_FRI, 5)).toBe(true)
    expect(weekdaySetHas(WEEKDAYS_MON_TO_FRI, 6)).toBe(false)
  })

  it("ticking a day twice leaves the set where it started", () => {
    const withSaturday = toggleWeekdayInSet(WEEKDAYS_MON_TO_FRI, 6)
    expect(weekdaySetHas(withSaturday, 6)).toBe(true)
    expect(toggleWeekdayInSet(withSaturday, 6)).toBe(WEEKDAYS_MON_TO_FRI)
  })
})

describe("repeatsOnLocalDate", () => {
  // The task's own acceptance test: a weekday-only task appears on Monday and
  // not on Saturday.
  it("fires a Mon-to-Fri rule on Monday and not on Saturday", () => {
    expect(repeatsOnLocalDate(WEEKDAYS_MON_TO_FRI, "2026-09-21")).toBe(true)
    expect(repeatsOnLocalDate(WEEKDAYS_MON_TO_FRI, "2026-09-26")).toBe(false)
  })

  it("fires an every-day rule on both", () => {
    expect(repeatsOnLocalDate(EVERY_DAY, "2026-09-21")).toBe(true)
    expect(repeatsOnLocalDate(EVERY_DAY, "2026-09-26")).toBe(true)
  })

  it("fires on no day for an impossible set or a broken date", () => {
    expect(repeatsOnLocalDate(0, "2026-09-21")).toBe(false)
    expect(repeatsOnLocalDate(EVERY_DAY, "2026-02-30")).toBe(false)
  })
})

describe("describeWeekdaySet", () => {
  it("names the two sets people actually pick", () => {
    expect(describeWeekdaySet(EVERY_DAY)).toBe("every day")
    expect(describeWeekdaySet(WEEKDAYS_MON_TO_FRI)).toBe("Mon to Fri")
  })

  it("lists the days of any other set", () => {
    expect(describeWeekdaySet(0b1000001)).toBe("Sun, Sat")
    expect(describeWeekdaySet(0b0001000)).toBe("Wed")
  })

  it("says nothing for a set that could not have been saved", () => {
    expect(describeWeekdaySet(0)).toBe("")
  })
})
