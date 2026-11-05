import { describe, expect, it } from "vitest"

import { FULL_DAY_MINUTES, plannedMinutes } from "@/lib/travel/board"

const card = (startTime: string | null, durationMinutes: number | null, nights: number | null = null) => ({
  id: `${startTime}-${durationMinutes}`,
  day: 1,
  position: 0,
  startTime,
  durationMinutes,
  nights,
})

describe("how full a day is (Travel features 3, part 8)", () => {
  it("adds up the timed cards: 9 to 11 and 1 to 5 is half of 12 hours", () => {
    expect(plannedMinutes([card("09:00", 120), card("13:00", 240)])).toBe(FULL_DAY_MINUTES / 2)
  })

  it("counts an overlap once", () => {
    expect(plannedMinutes([card("09:00", 120), card("10:00", 120), card("10:30", 30)])).toBe(180)
  })

  it("leaves out untimed cards, cards with no length, and stays", () => {
    expect(plannedMinutes([card(null, 120), card("09:00", null), card("15:00", 60, 3)])).toBe(0)
  })

  it("stops at midnight and can go past 12 hours", () => {
    expect(plannedMinutes([card("23:00", 180)])).toBe(60)
    expect(plannedMinutes([card("07:00", 13 * 60)])).toBeGreaterThan(FULL_DAY_MINUTES)
  })
})
