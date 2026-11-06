import { describe, expect, it } from "vitest"

import { meetingsByNow } from "@/lib/project/meetings-today"

const at = (time: string) => Date.parse(`2099-03-02T${time}:00Z`)
const meeting = (id: string, starts: string, ends: string) => ({
  id,
  startsAt: `2099-03-02T${starts}:00Z`,
  endsAt: `2099-03-02T${ends}:00Z`,
})

describe("Meetings today against the clock", () => {
  const standup = meeting("standup", "09:00", "09:15")
  const client = meeting("client", "15:00", "15:30")
  const review = meeting("review", "17:00", "18:00")

  it("puts the one on now first, then the ones to come, then the finished ones", () => {
    const order = meetingsByNow([standup, review, client], at("15:10")).map(({ meeting: m, when }) => `${m.id}:${when}`)
    expect(order).toEqual(["client:now", "review:later", "standup:done"])
  })

  it("counts a meeting as on from its start, and finished at its end", () => {
    expect(meetingsByNow([standup], at("09:00"))[0].when).toBe("now")
    expect(meetingsByNow([standup], at("09:15"))[0].when).toBe("done")
    expect(meetingsByNow([standup], at("08:59"))[0].when).toBe("later")
  })
})
