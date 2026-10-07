import { describe, expect, it } from "vitest"

import { describeArchiveCount } from "@/lib/pomodoro/task-archive"

describe("describeArchiveCount", () => {
  it("says it is a cut-off while older days exist", () => {
    expect(describeArchiveCount(50, true)).toBe("Your last 50 past tasks")
  })

  it("gives the plain count once everything is shown", () => {
    expect(describeArchiveCount(12, false)).toBe("12 past tasks")
    expect(describeArchiveCount(1, false)).toBe("1 past task")
  })
})
