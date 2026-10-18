import { describe, expect, it } from "vitest"

import { pacificMidnight } from "@/server/video/viral/youtube-units"

describe("when YouTube's day starts", () => {
  it("is midnight in California, in summer and in winter", () => {
    // 10:30 in the morning in Los Angeles, summer time (UTC-7).
    expect(pacificMidnight(new Date("2099-07-15T17:30:00Z")).toISOString()).toBe("2099-07-15T07:00:00.000Z")
    // 01:00 in the morning in Los Angeles, winter time (UTC-8).
    expect(pacificMidnight(new Date("2099-01-15T09:00:00Z")).toISOString()).toBe("2099-01-15T08:00:00.000Z")
  })
})
