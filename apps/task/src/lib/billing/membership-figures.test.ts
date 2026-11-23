import { describe, expect, it } from "vitest"

import { joinedChange } from "@/lib/billing/membership-figures"
import {
  buildSignupHistory,
  joinedByDay,
} from "@/server/people/membership"

type Row = Parameters<typeof buildSignupHistory>[0][number]

/** One row per day that somebody joined, the shape the database sends. */
function joins(year: number, month: number, days: Record<number, number>) {
  return Object.entries(days).map(
    ([day, people]): Row => ({ year, month, day: Number(day), people })
  )
}

function changeOn(today: string, rows: Row[]) {
  const history = buildSignupHistory(rows, joinedByDay(rows), new Date(today))
  return { history, change: joinedChange(history) }
}

describe("joined this month against the same days last month", () => {
  // Ten joined in the first five days of each month, and 40 more later in
  // August. Against all of August, September's 10 would read -80%.
  const august = joins(2026, 8, { 1: 4, 5: 6, 6: 20, 20: 20 })

  it("compares the 1st with the 1st", () => {
    const { change } = changeOn("2026-09-01T09:00:00Z", [
      ...august,
      ...joins(2026, 9, { 1: 8 }),
    ])
    expect(change).toEqual({ percent: 100, up: true })
  })

  it("compares the first five days with the first five days", () => {
    const { history, change } = changeOn("2026-09-05T09:00:00Z", [
      ...august,
      ...joins(2026, 9, { 2: 4, 5: 6 }),
    ])
    expect(history.newLastMonth).toBe(50)
    expect(change).toEqual({ percent: 0, up: true })
  })

  it("compares all of a 31-day month with all of the one before", () => {
    const { change } = changeOn("2026-08-31T09:00:00Z", [
      ...joins(2026, 7, { 1: 10, 31: 10 }),
      ...joins(2026, 8, { 3: 10 }),
    ])
    expect(change).toEqual({ percent: 50, up: false })
  })

  it("counts all of a shorter last month once this month passes its end", () => {
    const february = joins(2026, 2, { 1: 5, 28: 5 })
    const march = joins(2026, 3, { 2: 15 })
    for (const day of ["28", "30", "31"]) {
      const { change } = changeOn(`2026-03-${day}T09:00:00Z`, [
        ...february,
        ...march,
      ])
      expect(change).toEqual({ percent: 50, up: true })
    }
    // On the 27th, 28 February has not been reached yet.
    const { change } = changeOn("2026-03-27T09:00:00Z", [
      ...february,
      ...march,
    ])
    expect(change).toEqual({ percent: 200, up: true })
  })

  it("has no change when nobody joined in the same days last month", () => {
    const { change } = changeOn("2026-09-05T09:00:00Z", [
      ...joins(2026, 8, { 20: 12 }),
      ...joins(2026, 9, { 2: 3 }),
    ])
    expect(change).toBeNull()
  })
})
