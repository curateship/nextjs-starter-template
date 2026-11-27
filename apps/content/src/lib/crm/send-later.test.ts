import { describe, expect, it } from "vitest"

import { formatSendAt, mondayMorning, pickedMoment, tomorrowMorning } from "@/lib/crm/send-later"

/** Send later's times, in the person's own clock (CRM task 38, part 6). */
describe("send later", () => {
  // Wednesday 25 Nov 2099, 11:40 PM local.
  const lateWednesday = new Date(2099, 10, 25, 23, 40)

  it("puts tomorrow morning at 9 AM the next day", () => {
    expect(tomorrowMorning(lateWednesday)).toEqual(new Date(2099, 10, 26, 9, 0))
  })

  it("puts Monday morning on the coming Monday, and a week on when it is Monday already", () => {
    expect(mondayMorning(lateWednesday)).toEqual(new Date(2099, 10, 30, 9, 0))
    const monday = new Date(2099, 10, 30, 8, 0)
    expect(mondayMorning(monday)).toEqual(new Date(2099, 11, 7, 9, 0))
  })

  it("joins a picked day and time, and refuses a missing half", () => {
    expect(pickedMoment(new Date(2099, 11, 3), "14:30")).toEqual(new Date(2099, 11, 3, 14, 30))
    expect(pickedMoment(undefined, "14:30")).toBeNull()
    expect(pickedMoment(new Date(2099, 11, 3), "")).toBeNull()
  })

  it("says when in the words a person uses", () => {
    expect(formatSendAt(new Date(2099, 10, 26, 9, 0), lateWednesday)).toBe("Tomorrow, 9:00 AM")
    expect(formatSendAt(new Date(2099, 10, 30, 9, 0), lateWednesday)).toBe("Mon, 9:00 AM")
    expect(formatSendAt(new Date(2099, 11, 9, 9, 0), lateWednesday)).toBe("Dec 9, 9:00 AM")
  })
})
