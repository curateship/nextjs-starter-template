import { describe, expect, it } from "vitest"

import {
  describeRoomRepeat,
  nextRoomOccurrence,
  parseClockTime,
  roomRepeatProblem,
} from "@/lib/pomodoro/room-repeats"

const TUESDAY = 1 << 2
const NINE = 9 * 60

describe("nextRoomOccurrence", () => {
  it("finds the coming Tuesday at nine on the host's clock", () => {
    // Monday 5 Oct 2026, noon in London (BST, UTC+1).
    const next = nextRoomOccurrence(
      { weekdays: TUESDAY, startMinute: NINE, timezone: "Europe/London" },
      new Date("2026-10-05T11:00:00Z")
    )
    expect(next?.date).toBe("2026-10-06")
    expect(next?.startsAt.toISOString()).toBe("2026-10-06T08:00:00.000Z")
  })

  it("moves on a week once this Tuesday's start has passed", () => {
    const next = nextRoomOccurrence(
      { weekdays: TUESDAY, startMinute: NINE, timezone: "Europe/London" },
      new Date("2026-10-06T08:00:00Z")
    )
    expect(next?.date).toBe("2026-10-13")
  })

  it("keeps nine o'clock local across the autumn clock change", () => {
    // London leaves summer time on 25 Oct 2026, so 9am is 09:00 UTC after it.
    const next = nextRoomOccurrence(
      { weekdays: TUESDAY, startMinute: NINE, timezone: "Europe/London" },
      new Date("2026-10-21T12:00:00Z")
    )
    expect(next?.startsAt.toISOString()).toBe("2026-10-27T09:00:00.000Z")
  })

  it("has no occurrence on a day whose start time the clock jumps over", () => {
    // New York skips 02:00-03:00 on Sunday 14 Mar 2027.
    const next = nextRoomOccurrence(
      { weekdays: 1 << 0, startMinute: 2 * 60 + 30, timezone: "America/New_York" },
      new Date("2027-03-13T12:00:00Z")
    )
    expect(next?.date).toBe("2027-03-21")
  })

  it("answers nothing for an empty day set or an unknown timezone", () => {
    expect(
      nextRoomOccurrence({ weekdays: 0, startMinute: NINE, timezone: "UTC" }, new Date())
    ).toBeNull()
    expect(
      nextRoomOccurrence({ weekdays: TUESDAY, startMinute: NINE, timezone: "Mars/Base" }, new Date())
    ).toBeNull()
  })
})

describe("the window's rules", () => {
  it("reads the time box and refuses nonsense", () => {
    expect(parseClockTime("09:30")).toBe(570)
    expect(parseClockTime("24:00")).toBeNull()
    expect(parseClockTime("")).toBeNull()
  })

  it("names the first problem", () => {
    expect(roomRepeatProblem(0, NINE, [])).toBe("no_days")
    expect(roomRepeatProblem(TUESDAY, null, [])).toBe("not_a_time")
    expect(roomRepeatProblem(TUESDAY, NINE, ["nope"])).toBe("bad_email")
    expect(roomRepeatProblem(TUESDAY, NINE, ["sam@example.com"])).toBeNull()
  })

  it("describes the series in words", () => {
    expect(describeRoomRepeat(TUESDAY, NINE)).toBe("every Tuesday at 09:00")
    expect(describeRoomRepeat((1 << 1) | (1 << 4), 18 * 60 + 30)).toBe("Mon, Thu at 18:30")
  })
})
