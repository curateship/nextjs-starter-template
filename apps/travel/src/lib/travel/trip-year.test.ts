import { describe, expect, it } from "vitest"

import { startingYear, yearBars, YEAR_LABEL_DAYS } from "@/lib/travel/trip-year"

const trip = (id: string, startDate: string | null, days: number) => ({ id, startDate, days, timeZone: null })

describe("the Year tab's bars (Travel features 4, part 9)", () => {
  it("places a trip across its days of the year", () => {
    const { bars, rows } = yearBars([trip("tokyo", "2099-03-01", 5)], 2099)
    // 1 March is day 59 of 365, and 5 days is 5 of 365.
    expect(bars).toEqual([{ trip: trip("tokyo", "2099-03-01", 5), left: 59 / 365, width: 5 / 365, row: 0 }])
    expect(rows).toBe(1)
  })

  it("shows a trip over New Year in both years, cut at the edge", () => {
    const newYear = trip("ny", "2099-12-30", 5)
    const [late] = yearBars([newYear], 2099).bars
    expect(late.left).toBeCloseTo(363 / 365)
    expect(late.width).toBeCloseTo(2 / 365)
    const [early] = yearBars([newYear], 2100).bars
    expect(early.left).toBe(0)
    expect(early.width).toBeCloseTo(3 / 365)
  })

  it("leaves out trips with no dates or outside the year", () => {
    expect(yearBars([trip("someday", null, 4), trip("later", "2101-05-01", 3)], 2099).bars).toEqual([])
  })

  it("puts overlapping trips, and trips too close for their words, on separate rows", () => {
    const { bars, rows } = yearBars(
      [
        trip("a", "2099-01-10", 3),
        trip("b", "2099-01-20", 3),
        trip("c", `2099-${String(Math.ceil((10 + YEAR_LABEL_DAYS) / 31) + 1).padStart(2, "0")}-01`, 3),
      ],
      2099
    )
    expect(bars.map((bar) => [bar.trip.id, bar.row])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 0],
    ])
    expect(rows).toBe(2)
  })
})

describe("the year the tab opens on", () => {
  const at = new Date(2099, 5, 15)

  it("is the year of the next trip that hasn't ended", () => {
    expect(startingYear([trip("past", "2099-01-01", 3), trip("next", "2100-02-01", 3)], at)).toBe(2100)
  })

  it("is this year when a trip is on now or none is coming", () => {
    expect(startingYear([trip("on", "2099-06-10", 10), trip("next", "2100-02-01", 3)], at)).toBe(2099)
    expect(startingYear([trip("past", "2098-01-01", 3)], at)).toBe(2099)
  })
})
