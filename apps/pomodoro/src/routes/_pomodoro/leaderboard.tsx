import { createFileRoute } from "@tanstack/react-router"

import { LeaderboardPage } from "@/components/pomodoro/leaderboard-page"

/** The opt-in weekly ranking and your own stat cards. */
export const Route = createFileRoute("/_pomodoro/leaderboard")({
  component: LeaderboardPage,
})
