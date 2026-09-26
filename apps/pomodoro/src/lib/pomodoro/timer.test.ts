import { describe, expect, it } from "vitest"

import { cycleSessionLabel } from "@/lib/pomodoro/timer"

describe("the session label on the dashboard", () => {
  it("names the focus you are in, counting to the rhythm's number", () => {
    expect(cycleSessionLabel("focus", 0, 4)).toBe(
      "Session 1 of 4 before the long break"
    )
    expect(cycleSessionLabel("focus", 3, 4)).toBe(
      "Session 4 of 4 before the long break"
    )
    expect(cycleSessionLabel("focus", 1, 2)).toBe(
      "Session 2 of 2 before the long break"
    )
  })

  it("names the focus that comes next while a break runs", () => {
    expect(cycleSessionLabel("short", 1, 4)).toBe(
      "Next: session 2 of 4 before the long break"
    )
  })

  it("points a long break at the first focus of the new cycle", () => {
    expect(cycleSessionLabel("long", 4, 4)).toBe(
      "Next: session 1 of 4 before the long break"
    )
    expect(cycleSessionLabel("long", 2, 2)).toBe(
      "Next: session 1 of 2 before the long break"
    )
  })

  it("never counts past the rhythm, even on a count left over from a longer one", () => {
    expect(cycleSessionLabel("focus", 6, 2)).toBe(
      "Session 2 of 2 before the long break"
    )
    expect(cycleSessionLabel("focus", -3, 4)).toBe(
      "Session 1 of 4 before the long break"
    )
  })
})
