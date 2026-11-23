import { describe, expect, it } from "vitest"

import {
  LEADERBOARD_FLOOR_DATE,
  leaderboardStartDate,
} from "@/lib/pomodoro/leaderboard-windows"

// Pure day arithmetic on yyyy-mm-dd strings, the same rule the streaks follow,
// so no test here needs timezone data.
describe("leaderboard windows", () => {
  it("keeps This week as the seven days the board already showed", () => {
    // Today counts, so seven days back from the 29th starts on the 23rd.
    expect(leaderboardStartDate("week", "2026-09-29")).toBe("2026-09-23")
  })

  it("counts This month from the first of the calendar month", () => {
    expect(leaderboardStartDate("month", "2026-09-29")).toBe("2026-09-01")
    expect(leaderboardStartDate("month", "2026-09-01")).toBe("2026-09-01")
  })

  it("crosses a month boundary a week at a time", () => {
    expect(leaderboardStartDate("week", "2026-03-02")).toBe("2026-02-24")
  })

  it("floors All time rather than scanning every row there has ever been", () => {
    expect(leaderboardStartDate("all", "2026-09-29")).toBe(LEADERBOARD_FLOOR_DATE)
  })
})
