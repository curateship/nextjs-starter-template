import { describe, expect, it } from "vitest"

import { planRoute, staysForDay } from "@/lib/travel/best-order"

/**
 * Stops along a straight street, one minute's walk per number, so the
 * shortest way round is easy to see: the minutes between two stops are the
 * distance between their numbers.
 */
function street(at: number[]) {
  return (from: number, to: number) => Math.abs(at[from] - at[to])
}

describe("best order for a day (Travel features part 5)", () => {
  it("starts and ends at the hotel, and visits the stops in the shortest order", () => {
    // Stops 0, 1 and 2 sit at 30, 10 and 20 minutes up the street; the hotel (point 3) is at 0.
    const plan = planRoute({ count: 3, start: 3, end: 3, minutes: street([30, 10, 20, 0]) })
    // Out and back along a street is as long either way round: 10, 20, 30 or 30, 20, 10.
    expect([[1, 2, 0], [0, 2, 1]]).toContainEqual(plan.order)
    expect(plan.minutes).toBe(60)
    // As given: 0 → 30 → 10 → 20 → 0 is 30 + 20 + 10 + 20.
    expect(plan.currentMinutes).toBe(80)
  })

  it("keeps the first stop first when there is no hotel", () => {
    const plan = planRoute({ count: 4, start: null, end: null, minutes: street([20, 40, 10, 30]) })
    expect(plan.order[0]).toBe(0)
    // From 20: down to 10, then up to 30 and 40 is 10 + 20 + 10 = 40; up first then down is 30 + 30 = 60.
    expect(plan.order).toEqual([0, 2, 3, 1])
    expect(plan.minutes).toBe(40)
  })

  it("leaves a day already in its best order as it is", () => {
    const plan = planRoute({ count: 3, start: 3, end: null, minutes: street([10, 20, 30, 0]) })
    expect(plan.order).toEqual([0, 1, 2])
    expect(plan.minutes).toBe(plan.currentMinutes)
  })

  it("goes to the nearest stop each time past 8 stops", () => {
    const at = [90, 10, 50, 30, 70, 20, 80, 40, 60, 100, 0]
    const plan = planRoute({ count: 10, start: 10, end: null, minutes: street(at) })
    expect(plan.order.map((stop) => at[stop])).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
  })

  it("uses a pair with no route only when nothing else will do", () => {
    const minutes = (from: number, to: number) => ((from === 3 && to === 0) || (from === 0 && to === 3) ? null : 5)
    const plan = planRoute({ count: 3, start: 3, end: null, minutes })
    expect(plan.order[0]).not.toBe(0)
  })

  it("finds last night's stay to start from and tonight's to end at", () => {
    const tokyo = { id: "tokyo", day: 1, nights: 3 }
    const kyoto = { id: "kyoto", day: 4, nights: 2 }
    // Day 2: woke up in Tokyo, sleeps in Tokyo.
    expect(staysForDay([tokyo, kyoto], 2)).toEqual({ start: tokyo, end: tokyo })
    // Day 4: woke up in Tokyo, moves to Kyoto.
    expect(staysForDay([tokyo, kyoto], 4)).toEqual({ start: tokyo, end: kyoto })
    // Day 1: nowhere last night, so it starts from tonight's stay.
    expect(staysForDay([tokyo, kyoto], 1)).toEqual({ start: tokyo, end: tokyo })
    // Day 6: checked out of Kyoto, nowhere tonight.
    expect(staysForDay([tokyo, kyoto], 6)).toEqual({ start: kyoto, end: null })
    expect(staysForDay([], 3)).toEqual({ start: null, end: null })
  })
})
