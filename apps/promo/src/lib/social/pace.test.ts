import { describe, expect, it } from "vitest"

import { paceCounts, paceLimit } from "./pace"

const now = new Date("2026-10-12T15:00:00Z")
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000)

describe("how fast an account is commenting", () => {
  it("counts the last hour and the last day apart", () => {
    const posted = [minutesAgo(10), minutesAgo(50), minutesAgo(70), minutesAgo(23 * 60), minutesAgo(25 * 60)]
    expect(paceCounts(posted, now)).toEqual({ lastHour: 2, lastDay: 4 })
  })

  it("lets one more through while both limits have room", () => {
    expect(paceLimit({ posted: [minutesAgo(10)], waiting: 0, now, perHour: 2, perDay: 6 })).toBeNull()
  })

  it("refuses past the hour, with when the oldest leaves the hour", () => {
    const limit = paceLimit({ posted: [minutesAgo(40), minutesAgo(10)], waiting: 0, now, perHour: 2, perDay: 6 })
    expect(limit).toEqual({ limit: "hour", nextAllowedAt: minutesAgo(40 - 60) })
  })

  it("refuses past the day, with when the oldest leaves the day", () => {
    const posted = [6, 5, 4, 3, 2].map((hours) => minutesAgo(hours * 60)).concat([minutesAgo(90 * 4)])
    const limit = paceLimit({ posted, waiting: 0, now, perHour: 2, perDay: 6 })
    expect(limit?.limit).toBe("day")
    expect(limit?.nextAllowedAt?.toISOString()).toBe(new Date(minutesAgo(6 * 60).getTime() + 86_400_000).toISOString())
  })

  it("counts comments still waiting to go, which have no time to age out", () => {
    expect(paceLimit({ posted: [], waiting: 2, now, perHour: 2, perDay: 6 })).toEqual({
      limit: "hour",
      nextAllowedAt: null,
    })
    // One sent, one waiting: the sent one leaving is what makes room.
    expect(paceLimit({ posted: [minutesAgo(30)], waiting: 1, now, perHour: 2, perDay: 6 })).toEqual({
      limit: "hour",
      nextAllowedAt: minutesAgo(-30),
    })
  })

  it("names the later of the two when both are full", () => {
    const posted = [minutesAgo(20 * 60), minutesAgo(30), minutesAgo(20)]
    const limit = paceLimit({ posted, waiting: 0, now, perHour: 2, perDay: 3 })
    // The hour frees up in 30 minutes, the day only in 4 hours.
    expect(limit).toEqual({ limit: "day", nextAllowedAt: minutesAgo(20 * 60 - 24 * 60) })
  })
})
