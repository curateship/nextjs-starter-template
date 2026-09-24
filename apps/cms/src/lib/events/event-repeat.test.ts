import { describe, expect, it } from "vitest"

import {
  addDays,
  addMonthsToDay,
  describeRepeat,
  firstRepeatDates,
  nextRepeatDate,
  nthWeekdayOfMonth,
  parseRepeatRule,
  repeatProblem,
  repeatStartingFrom,
  weekdayOf,
  type RepeatRule,
} from "@/lib/events/event-repeat"

/**
 * Copied with the rules from the old Directory app's
 * `lib/utils/event-recurrence.test.ts`, plus the checks the schedule box
 * leans on.
 */

/** The next `count` dates after `from`, walked the way the top-up job does. */
function nextDates(rule: RepeatRule, from: string, count: number): string[] {
  const dates: string[] = []
  let cursor = from
  while (dates.length < count) {
    const next = nextRepeatDate(rule, cursor)
    if (!next) break
    dates.push(next)
    cursor = next
  }
  return dates
}

describe("days", () => {
  it("reads the weekday of a day, Sunday first", () => {
    expect(weekdayOf("2026-07-28")).toBe(2)
    expect(weekdayOf("2026-08-07")).toBe(5)
  })

  it("adds days and months across a month's and a year's end", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01")
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31")
    expect(addMonthsToDay("2026-10-23", 3)).toBe("2027-01-23")
  })

  it("finds the nth weekday of a month, and the last one", () => {
    expect(nthWeekdayOfMonth(2026, 8, 1, 5)).toBe("2026-08-07")
    expect(nthWeekdayOfMonth(2026, 7, -1, 1)).toBe("2026-07-27")
    expect(nthWeekdayOfMonth(2026, 8, 4, 5)).toBe("2026-08-28")
  })

  it("picks the fifth Friday as the last in a month with five", () => {
    // October 2026 has Fridays on the 2nd, 9th, 16th, 23rd and 30th.
    expect(nthWeekdayOfMonth(2026, 10, -1, 5)).toBe("2026-10-30")
    expect(nthWeekdayOfMonth(2026, 10, 4, 5)).toBe("2026-10-23")
  })
})

describe("weekly", () => {
  it("makes the next Tuesdays after a Saturday", () => {
    expect(
      nextDates({ freq: "weekly", weekdays: [2], until: null }, "2026-07-25", 8)
    ).toEqual([
      "2026-07-28",
      "2026-08-04",
      "2026-08-11",
      "2026-08-18",
      "2026-08-25",
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
    ])
  })

  it("mixes two weekdays", () => {
    expect(
      nextDates(
        { freq: "weekly", weekdays: [1, 3], until: null },
        "2026-07-25",
        4
      )
    ).toEqual(["2026-07-27", "2026-07-29", "2026-08-03", "2026-08-05"])
  })

  it("stops on its end day", () => {
    expect(
      nextDates(
        { freq: "weekly", weekdays: [2], until: "2026-08-11" },
        "2026-07-25",
        8
      )
    ).toEqual(["2026-07-28", "2026-08-04", "2026-08-11"])
  })
})

describe("monthly", () => {
  it("makes the first Friday of each month", () => {
    expect(
      nextDates(
        { freq: "monthly", week: 1, weekday: 5, until: null },
        "2026-07-25",
        5
      )
    ).toEqual([
      "2026-08-07",
      "2026-09-04",
      "2026-10-02",
      "2026-11-06",
      "2026-12-04",
    ])
  })

  it("makes the last Monday of each month", () => {
    expect(
      nextDates(
        { freq: "monthly", week: -1, weekday: 1, until: null },
        "2026-07-25",
        3
      )
    ).toEqual(["2026-07-27", "2026-08-31", "2026-09-28"])
  })

  it("finds the next date five weeks on", () => {
    // The first Thursday of October 2026 is the 1st and of November the 5th.
    expect(
      nextRepeatDate(
        { freq: "monthly", week: 1, weekday: 4, until: null },
        "2026-10-01"
      )
    ).toBe("2026-11-05")
  })
})

describe("the sentence", () => {
  it("names one weekday or several", () => {
    expect(
      describeRepeat({ freq: "weekly", weekdays: [4], until: null })
    ).toBe("Every Thursday")
    expect(
      describeRepeat({ freq: "weekly", weekdays: [1, 3, 5], until: null })
    ).toBe("Every Monday, Wednesday and Friday")
  })

  it("names the week of the month and the end day", () => {
    expect(
      describeRepeat({ freq: "monthly", week: 1, weekday: 2, until: null })
    ).toBe("The first Tuesday of every month")
    expect(
      describeRepeat({
        freq: "monthly",
        week: -1,
        weekday: 5,
        until: "2026-12-18",
      })
    ).toBe("The last Friday of every month until Dec 18, 2026")
  })

  it("matches the dates made", () => {
    const rule: RepeatRule = {
      freq: "weekly",
      weekdays: [4],
      until: "2026-12-18",
    }
    expect(describeRepeat(rule)).toBe("Every Thursday until Dec 18, 2026")
    const dates = firstRepeatDates(rule, "2026-10-01", 20)
    expect(dates.every((date) => weekdayOf(date) === 4)).toBe(true)
    expect(dates[0]).toBe("2026-10-01")
    expect(dates[dates.length - 1]).toBe("2026-12-17")
    expect(dates).toHaveLength(12)
  })
})

describe("reading a rule", () => {
  it("sorts weekdays and drops repeats", () => {
    expect(parseRepeatRule({ freq: "weekly", weekdays: [3, 1, 3] })).toEqual({
      freq: "weekly",
      weekdays: [1, 3],
      until: null,
    })
  })

  it("refuses what is not a rule", () => {
    expect(parseRepeatRule({ freq: "weekly", weekdays: [] })).toBeNull()
    expect(parseRepeatRule({ freq: "weekly", weekdays: [9] })).toBeNull()
    expect(
      parseRepeatRule({ freq: "monthly", week: 5, weekday: 2 })
    ).toBeNull()
    expect(parseRepeatRule({ freq: "daily" })).toBeNull()
    expect(parseRepeatRule(null)).toBeNull()
  })

  it("keeps a real end day and drops one that is not", () => {
    expect(
      parseRepeatRule({
        freq: "monthly",
        week: -1,
        weekday: 0,
        until: "2026-01-01",
      })
    ).toEqual({ freq: "monthly", week: -1, weekday: 0, until: "2026-01-01" })
    expect(
      parseRepeatRule({ freq: "weekly", weekdays: [2], until: "soon" })?.until
    ).toBeNull()
  })
})

describe("starting a schedule", () => {
  it("starts from the event's own weekday and week", () => {
    expect(repeatStartingFrom("weekly", "2026-10-01", null)).toEqual({
      freq: "weekly",
      weekdays: [4],
      until: null,
    })
    expect(repeatStartingFrom("monthly", "2026-10-15", null)).toEqual({
      freq: "monthly",
      week: 3,
      weekday: 4,
      until: null,
    })
    expect(repeatStartingFrom("monthly", "2026-10-30", null)).toEqual({
      freq: "monthly",
      week: -1,
      weekday: 5,
      until: null,
    })
  })

  it("refuses a rule that misses the event's own day or ends before it", () => {
    const thursdays: RepeatRule = {
      freq: "weekly",
      weekdays: [4],
      until: null,
    }
    expect(repeatProblem(thursdays, "2026-10-01")).toBeNull()
    expect(repeatProblem(thursdays, "2026-09-30")).toBe(
      'The event starts on a Wednesday, and "Every Thursday" never falls on it. Change the repeat or the start day.'
    )
    expect(
      repeatProblem({ ...thursdays, until: "2026-09-01" }, "2026-10-01")
    ).toBe(
      "The repeat ends before the event starts. Pick a later end day, or none."
    )
  })
})
