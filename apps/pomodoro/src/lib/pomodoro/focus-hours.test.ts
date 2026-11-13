import { describe, expect, it } from "vitest"

import { formatFocusHours } from "@/lib/pomodoro/focus-hours"

describe("formatFocusHours", () => {
  it("counts hours, never days, and minutes under an hour", () => {
    expect(formatFocusHours(0)).toBe("0m")
    expect(formatFocusHours(45 * 60)).toBe("45m")
    expect(formatFocusHours(269 * 3_600 + 1_200)).toBe("269h")
    expect(formatFocusHours(1_234 * 3_600)).toBe("1,234h")
  })
})
