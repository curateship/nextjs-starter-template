import { describe, expect, it } from "vitest"

import { growthFrom, isRising, viewDay } from "@/lib/viral/rising"

/** Rising fast (task "Viral features", part 2): "Doubled in a day". */

describe("Rising fast", () => {
  const today = "2099-03-10"

  it("rises when the views at least doubled since the day before", () => {
    const growth = growthFrom(
      [
        { day: "2099-03-09", views: 40_000 },
        { day: "2099-03-10", views: 80_000 },
      ],
      today
    )
    expect(growth).toEqual({ times: 2, gained: 40_000 })
    expect(isRising(growth)).toBe(true)
  })

  it("doesn't rise at 40,000 then 79,000", () => {
    const growth = growthFrom(
      [
        { day: "2099-03-09", views: 40_000 },
        { day: "2099-03-10", views: 79_000 },
      ],
      today
    )
    expect(growth.gained).toBe(39_000)
    expect(isRising(growth)).toBe(false)
  })

  it("needs two figures one day apart", () => {
    expect(growthFrom([{ day: "2099-03-10", views: 80_000 }], today)).toEqual({ times: null, gained: null })
    expect(
      growthFrom(
        [
          { day: "2099-03-07", views: 10_000 },
          { day: "2099-03-10", views: 80_000 },
        ],
        today
      )
    ).toEqual({ times: null, gained: null })
  })

  it("stops claiming it once the newest figure is older than yesterday", () => {
    const stale = growthFrom(
      [
        { day: "2099-03-06", views: 10_000 },
        { day: "2099-03-07", views: 80_000 },
      ],
      today
    )
    expect(isRising(stale)).toBe(false)
    expect(
      isRising(
        growthFrom(
          [
            { day: "2099-03-08", views: 10_000 },
            { day: "2099-03-09", views: 80_000 },
          ],
          today
        )
      )
    ).toBe(true)
  })

  it("files a figure under its UTC day", () => {
    expect(viewDay(new Date("2099-03-10T23:30:00Z"))).toBe("2099-03-10")
  })
})
