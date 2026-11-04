import { describe, expect, it } from "vitest"

import { boardColumns, formatTimeRange, gapsOf, sortColumn } from "@/lib/travel/board"
import { tripTotals } from "@/lib/travel/budget"
import { countdown, formatDayDate, formatTripDates, todaysDay, todayIn } from "@/lib/travel/dates"
import { closedAllDay, hoursWarning, nearestOpenDay } from "@/lib/travel/hours"
import { formatMoney, parseMoney, partOfTime, type DayPart } from "@/lib/travel/rules"
import { filterActivities } from "@/lib/travel/trip-search"

const card = (id: string, startTime: string | null, position: number, durationMinutes: number | null = null) => ({
  id,
  day: 1,
  position,
  startTime,
  durationMinutes,
})

describe("the order of a day (part 4)", () => {
  it("puts timed cards first by time, then untimed ones in dragged order", () => {
    const sorted = sortColumn([card("none", null, 0), card("two", "14:00", 1), card("nine", "09:00", 2)])
    expect(sorted.map((item) => item.id)).toEqual(["nine", "two", "none"])
  })

  it("puts a card past the trip's last day into Ideas rather than losing it", () => {
    const columns = boardColumns(2, [{ ...card("lost", null, 0), day: 5 }])
    expect(columns.get("ideas")?.map((item) => item.id)).toEqual(["lost"])
  })

  it("writes a time range, past midnight too", () => {
    expect(formatTimeRange("09:00", 120)).toBe("9:00 AM to 11:00 AM")
    expect(formatTimeRange("23:00", 120)).toBe("11:00 PM to 1:00 AM")
  })
})

describe("free time (part 8)", () => {
  it("reads 9 to 11 AM then 12:30 PM as 1h 30m free, and hides gaps under 15 minutes", () => {
    const gaps = gapsOf([card("a", "09:00", 0, 120), card("b", "12:30", 1, 30), card("c", "13:05", 2)])
    expect(gaps).toEqual([{ afterId: "a", beforeId: "b", kind: "free", minutes: 90 }])
  })

  it("says how much two cards overlap", () => {
    expect(gapsOf([card("a", "09:00", 0, 90), card("b", "10:00", 1)])[0]).toMatchObject({ kind: "overlap", minutes: 30 })
  })
})

describe("dates (parts 6, 7 and 36)", () => {
  it("names a day and a trip's dates", () => {
    expect(formatDayDate("2026-03-04")).toBe("Wed 4 Mar")
    expect(formatTripDates("2026-03-04", 5)).toBe("4 to 8 Mar 2026")
    expect(formatTripDates("2026-02-27", 4)).toBe("27 Feb to 2 Mar 2026")
  })

  it("finds today where the trip is, not where the reader is", () => {
    // 23:30 in London on 3 Mar is already 4 Mar in Tokyo.
    const at = new Date("2026-03-03T23:30:00Z")
    expect(todayIn("Asia/Tokyo", at)).toBe("2026-03-04")
    expect(todaysDay({ startDate: "2026-03-03", days: 5, timeZone: "Asia/Tokyo" }, at)).toBe(2)
    expect(todaysDay({ startDate: "2026-03-03", days: 5, timeZone: "Europe/London" }, at)).toBe(1)
    expect(todaysDay({ startDate: null, days: 5, timeZone: null }, at)).toBeNull()
  })

  it("counts down and up", () => {
    const at = new Date("2026-03-01T12:00:00Z")
    const trip = (startDate: string | null, days = 3) => ({ startDate, days, timeZone: "UTC" })
    expect(countdown(trip("2026-03-13"), at)).toBe("in 12 days")
    expect(countdown(trip("2026-03-02"), at)).toBe("tomorrow")
    expect(countdown(trip("2026-02-28"), at)).toBe("on now")
    expect(countdown(trip("2026-02-26"), at)).toBe("ended yesterday")
    expect(countdown(trip("2026-02-20"), at)).toBe("ended 7 days ago")
    expect(countdown(trip(null), at)).toBe("No dates")
  })
})

describe("opening hours (part 21)", () => {
  const nineToFive = Array.from({ length: 7 }, () => [{ open: "09:00", close: "17:00" }])
  it("warns a museum open 9 to 5 placed at 6 PM, and not at 10 AM", () => {
    expect(hoursWarning(nineToFive, 2, "18:00")).toBe("Closed at 6:00 PM on Tuesdays")
    expect(hoursWarning(nineToFive, 2, "10:00")).toBeNull()
  })

  it("reads a closed day and hours past midnight", () => {
    const hours = Array.from({ length: 7 }, (_, day) => (day === 1 ? [] : [{ open: "18:00", close: "02:00" }]))
    expect(hoursWarning(hours, 1, "12:00")).toBe("Closed on Mondays")
    expect(hoursWarning(hours, 1, "01:00")).toBeNull()
    expect(hoursWarning(hours, 3, "23:00")).toBeNull()
  })

  it("says nothing with no hours, no date or no time", () => {
    expect(hoursWarning(null, 2, "18:00")).toBeNull()
    expect(hoursWarning(nineToFive, null, "18:00")).toBeNull()
    expect(hoursWarning(nineToFive, 2, null)).toBeNull()
  })
})

describe("parts of the day (Travel features part 2)", () => {
  const parted = (id: string, dayPart: DayPart | null, position: number) => ({ ...card(id, null, position), dayPart })

  it("puts a Morning card, a 2 PM card and an Evening card in that order, whatever order they were dragged", () => {
    const sorted = sortColumn([parted("evening", "evening", 0), card("two", "14:00", 1), parted("morning", "morning", 2)])
    expect(sorted.map((item) => item.id)).toEqual(["morning", "two", "evening"])
  })

  it("puts timed cards first inside their part, then untimed ones in dragged order, then cards with no part", () => {
    const sorted = sortColumn([
      card("loose", null, 0),
      parted("morning-b", "morning", 1),
      card("nine", "09:00", 2),
      parted("morning-a", "morning", 3),
      card("eleven", "11:30", 4),
      parted("night", "night", 5),
    ])
    expect(sorted.map((item) => item.id)).toEqual(["nine", "eleven", "morning-b", "morning-a", "night", "loose"])
  })

  it("keeps the old order when no card has a part", () => {
    const sorted = sortColumn([card("none", null, 0), card("two", "14:00", 1), card("nine", "09:00", 2)])
    expect(sorted.map((item) => item.id)).toEqual(["nine", "two", "none"])
  })

  it("counts a time as the part its hour falls in", () => {
    expect(partOfTime("00:30")).toBe("morning")
    expect(partOfTime("11:59")).toBe("morning")
    expect(partOfTime("12:00")).toBe("afternoon")
    expect(partOfTime("16:59")).toBe("afternoon")
    expect(partOfTime("17:00")).toBe("evening")
    expect(partOfTime("20:59")).toBe("evening")
    expect(partOfTime("21:00")).toBe("night")
  })
})

describe("closed all day (Travel features part 1)", () => {
  // Shut on Mondays, open 10 to 6 every other day.
  const shutMondays = Array.from({ length: 7 }, (_, day) => (day === 1 ? [] : [{ open: "10:00", close: "18:00" }]))
  // 2 Nov 2026 is a Monday, so Day 1 is a Monday and Day 8 the next.
  const trip = { startDate: "2026-11-02", days: 9 }

  it("warns an untimed card on a day its place is shut, and no other untimed card", () => {
    expect(hoursWarning(shutMondays, 1, null)).toBe("Closed on Mondays")
    expect(hoursWarning(shutMondays, 2, null)).toBeNull()
    expect(closedAllDay(shutMondays, 1)).toBe(true)
    expect(closedAllDay(shutMondays, 2)).toBe(false)
  })

  it("never calls a place with no hours, or with every day empty, shut", () => {
    expect(closedAllDay(null, 1)).toBe(false)
    expect(closedAllDay(Array.from({ length: 7 }, () => []), 1)).toBe(false)
    expect(hoursWarning(Array.from({ length: 7 }, () => []), 1, null)).toBeNull()
  })

  it("moves to the nearest open day, a later one first when two are as near", () => {
    // Day 1 (Mon) is shut; Day 2 (Tue) is the nearest.
    expect(nearestOpenDay(shutMondays, trip, 1)).toBe(2)
    // Day 8 (Mon) is shut; Day 9 and Day 7 are as near, and the later one wins.
    expect(nearestOpenDay(shutMondays, trip, 8)).toBe(9)
    // On the trip's last day, the day before is the nearest.
    expect(nearestOpenDay(shutMondays, { startDate: "2026-11-02", days: 8 }, 8)).toBe(7)
  })

  it("offers no move on an open day, in Ideas, on a trip with no dates, or when no day is open", () => {
    expect(nearestOpenDay(shutMondays, trip, 2)).toBeNull()
    expect(nearestOpenDay(shutMondays, trip, null)).toBeNull()
    expect(nearestOpenDay(shutMondays, { startDate: null, days: 9 }, 1)).toBeNull()
    // A one-day trip on a Monday has nowhere to go.
    expect(nearestOpenDay(shutMondays, { startDate: "2026-11-02", days: 1 }, 1)).toBeNull()
  })
})

describe("money (part 28)", () => {
  it("adds up each day, counts a stay once, and leaves Ideas out", () => {
    const totals = tripTotals(3, [
      { day: 1, costCents: 4000 },
      { day: 1, costCents: 6000 },
      { day: 2, costCents: 10000 },
      { day: null, costCents: 999 },
      { day: 3, costCents: null },
    ])
    expect(totals).toEqual({ total: 20000, perDay: [10000, 10000, 0], ideas: 999 })
  })

  it("reads typed money and writes it in the trip's currency", () => {
    expect(parseMoney("1,240.50")).toBe(124050)
    expect(parseMoney("abc")).toBeNull()
    expect(formatMoney(9_800_000, "JPY")).toBe("¥98,000")
    expect(formatMoney(124050, "USD")).toBe("$1,240.50")
  })
})

describe("filters (part 17)", () => {
  it("narrows by type and words in the name or place", () => {
    const activities = [
      { id: "a", typeId: "food", title: "Ramen", place: { name: "Fuunji", address: "Yoyogi" } },
      { id: "b", typeId: "sight", title: "Temple", place: null },
    ]
    expect(filterActivities(activities, { type: "food" }).map((item) => item.id)).toEqual(["a"])
    expect(filterActivities(activities, { q: "yoyogi" }).map((item) => item.id)).toEqual(["a"])
  })
})
