import { shiftLocalDate } from "@/lib/pomodoro/focus-history"

/**
 * How far back a board looks, and what each window is called.
 *
 * Shared by the browser and the server, so the tab a person clicked and the
 * start date the query uses are named by the same list. The browser never
 * sends a date: it sends one of these three words and the server works the
 * date out, which is what stops a caller asking for a scan of all history
 * under a different name.
 */

export const LEADERBOARD_WINDOWS = ["week", "month", "all"] as const

export type LeaderboardWindow = (typeof LEADERBOARD_WINDOWS)[number]

export const LEADERBOARD_WINDOW_LABELS: Record<LeaderboardWindow, string> = {
  week: "This week",
  month: "This month",
  all: "All time",
}

/** The line beside a board's title, saying what the figures cover. */
export const LEADERBOARD_WINDOW_NOTES: Record<LeaderboardWindow, string> = {
  week: "last 7 days",
  month: "this calendar month",
  all: "every day so far",
}

export const DEFAULT_LEADERBOARD_WINDOW: LeaderboardWindow = "week"

/**
 * The oldest day any board counts.
 *
 * All time has to end somewhere or the query says "every row in the table",
 * and `daily_focus_stats` is indexed by date. This app's first focus session
 * was recorded in 2025, so a floor here changes no figure and keeps all three
 * windows the same shape of query: one date, one index.
 */
export const LEADERBOARD_FLOOR_DATE = "2025-01-01"

/**
 * The first day a window counts, in the viewer's own calendar days.
 *
 * Pure arithmetic on `yyyy-mm-dd` strings, the same rule the streaks follow, so
 * no timezone data is needed to work a start date out or to test one.
 */
export function leaderboardStartDate(
  window: LeaderboardWindow,
  todayLocalDate: string
) {
  switch (window) {
    case "week":
      return shiftLocalDate(todayLocalDate, -6)
    case "month":
      // The calendar month, not the last 30 days: the tab says "This month".
      return `${todayLocalDate.slice(0, 8)}01`
    case "all":
      return LEADERBOARD_FLOOR_DATE
  }
}
