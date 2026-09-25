import { describe, expect, it } from "vitest"

import {
  blankListingHours,
  type ListingHours,
  type ListingWeekday,
} from "@/lib/directory/listing-details"
import { wallClockAt } from "@/lib/events/event-time"
import {
  dealEndsAt,
  dealNowText,
  dealStage,
  dealTimesLines,
  type TimedDeal,
} from "@/lib/promotions/deal-times"

/** A week with the same stretch on each of these days. */
function on(
  days: ListingWeekday[],
  open: string,
  close: string
): ListingHours {
  const hours = blankListingHours()
  for (const day of days) hours[day] = { open, close }
  return hours
}

const WEEKDAYS: ListingWeekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
]

// Tuesday 6 Oct 2026 to Monday 12 Oct 2026.
const happyHour: TimedDeal = {
  startDate: "2026-10-05",
  endDate: "2026-10-12",
  times: on(WEEKDAYS, "16:00", "18:00"),
}

describe("on now, and next", () => {
  it("says On now at 4:30 PM on a Tuesday and names tomorrow at 7 PM", () => {
    expect(dealNowText(happyHour, "2026-10-06T16:30")).toBe(
      "On now · until 6 PM"
    )
    expect(dealNowText(happyHour, "2026-10-06T19:00")).toBe(
      "Next: tomorrow at 4 PM"
    )
    expect(dealNowText(happyHour, "2026-10-06T09:00")).toBe(
      "Next: today at 4 PM"
    )
  })

  it("skips the weekend", () => {
    expect(dealNowText(happyHour, "2026-10-09T19:00")).toBe(
      "Next: Mon at 4 PM"
    )
  })

  it("names the day and date past a week, and the first day before it starts", () => {
    const monthly: TimedDeal = {
      startDate: "2026-10-01",
      endDate: null,
      times: on(["saturday"], "12:00", "15:00"),
    }
    expect(dealNowText(monthly, "2026-09-20T10:00")).toBe(
      "Next: Sat, Oct 3 at 12 PM"
    )
    expect(dealStage(monthly, "2026-09-20T10:00")).toBe("soon")
  })

  it("says On now all day for a deal with no times, and nothing before it", () => {
    const allDay: TimedDeal = {
      startDate: "2026-10-05",
      endDate: null,
      times: blankListingHours(),
    }
    expect(dealNowText(allDay, "2026-10-06T03:00")).toBe("On now")
    expect(dealNowText(allDay, "2026-10-01T03:00")).toBeNull()
  })

  it("names a stretch that has not started yet, then says it is on", () => {
    const evening: TimedDeal = {
      startDate: "2026-10-05",
      endDate: null,
      times: on(["tuesday"], "22:00", "00:00"),
    }
    expect(dealNowText(evening, "2026-10-06T18:00")).toBe("Next: today at 10 PM")
    expect(dealNowText(evening, "2026-10-06T23:00")).toBe(
      "On now · until midnight"
    )
  })
})

describe("past midnight", () => {
  const lateNight: TimedDeal = {
    startDate: "2026-10-05",
    endDate: "2026-10-09",
    // Friday is the last day: 10 PM Friday to 2 AM Saturday.
    times: on(["friday"], "22:00", "02:00"),
  }

  it("counts 1 AM Saturday as Friday night", () => {
    expect(dealNowText(lateNight, "2026-10-10T01:00")).toBe(
      "On now · until 2 AM"
    )
  })

  it("runs the last night on until it closes", () => {
    expect(dealEndsAt(lateNight)).toBe("2026-10-10T02:00")
    expect(dealStage(lateNight, "2026-10-10T01:59")).toBe("on")
    expect(dealStage(lateNight, "2026-10-10T02:00")).toBe("ended")
    expect(dealNowText(lateNight, "2026-10-10T02:00")).toBeNull()
  })

  it("never starts a night before the first day", () => {
    const fromSaturday: TimedDeal = { ...lateNight, startDate: "2026-10-10", endDate: null }
    // Friday 9 Oct is before the first day, so 1 AM Saturday is not on.
    expect(dealNowText(fromSaturday, "2026-10-10T01:00")).toBe(
      "Next: Fri at 10 PM"
    )
  })

  it("ends at midnight after the last day when that night stops by then", () => {
    expect(dealEndsAt(happyHour)).toBe("2026-10-13T00:00")
    expect(dealStage(happyHour, "2026-10-12T23:59")).toBe("on")
    expect(dealStage(happyHour, "2026-10-13T00:00")).toBe("ended")
  })

  it("treats the same start and end as 24 hours", () => {
    const allDayMonday: TimedDeal = {
      startDate: "2026-10-05",
      endDate: "2026-10-05",
      times: on(["monday"], "00:00", "00:00"),
    }
    expect(dealNowText(allDayMonday, "2026-10-05T23:00")).toBe(
      "On now · until midnight"
    )
    expect(dealEndsAt(allDayMonday)).toBe("2026-10-06T00:00")
  })
})

describe("a site in another time zone", () => {
  it("reads now from the site's clock, not the server's", () => {
    // 20:30 UTC is 4:30 PM in Toronto and 1:30 PM in Vancouver.
    const at = new Date("2026-10-06T20:30:00Z")
    expect(
      dealNowText(happyHour, wallClockAt("America/Toronto", at))
    ).toBe("On now · until 6 PM")
    expect(
      dealNowText(happyHour, wallClockAt("America/Vancouver", at))
    ).toBe("Next: today at 4 PM")
  })
})

describe("the times in words", () => {
  it("reads Mon to Fri, 4 to 6 PM as one line", () => {
    expect(dealTimesLines(happyHour.times)).toEqual(["Mon to Fri, 4 to 6 PM"])
  })

  it("groups the days that share times, and says the rest in order", () => {
    const hours = on(["monday", "tuesday", "wednesday", "friday"], "11:30", "14:00")
    hours.saturday = { open: "22:00", close: "02:00" }
    hours.sunday = { open: "12:00", close: "15:00" }
    expect(dealTimesLines(hours)).toEqual([
      "Mon to Wed and Fri, 11:30 AM to 2 PM",
      "Sat, 10 PM to 2 AM",
      "Sun, 12 to 3 PM",
    ])
  })

  it("says Every day and all day", () => {
    const allWeek = on(
      [...WEEKDAYS, "saturday", "sunday"],
      "16:00",
      "16:00"
    )
    expect(dealTimesLines(allWeek)).toEqual(["Every day, all day"])
    expect(dealTimesLines(on(["saturday", "sunday"], "10:00", "11:00"))).toEqual([
      "Sat and Sun, 10 to 11 AM",
    ])
  })

  it("says nothing for a deal that runs all day, every day", () => {
    expect(dealTimesLines(blankListingHours())).toEqual([])
  })
})
