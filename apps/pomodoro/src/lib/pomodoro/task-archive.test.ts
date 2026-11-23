import { describe, expect, it } from "vitest"

import { describeArchiveCount } from "@/lib/pomodoro/task-archive"

describe("describeArchiveCount", () => {
  it("says it is a cut-off while older days exist", () => {
    expect(describeArchiveCount(50, true)).toBe("Past tasks · 50+")
  })

  it("gives the plain count once everything is shown", () => {
    expect(describeArchiveCount(12, false)).toBe("Past tasks · 12")
    expect(describeArchiveCount(1, false)).toBe("Past tasks · 1")
  })

  it("leaves the number off while nothing is listed", () => {
    expect(describeArchiveCount(0, true)).toBe("Past tasks")
  })
})
