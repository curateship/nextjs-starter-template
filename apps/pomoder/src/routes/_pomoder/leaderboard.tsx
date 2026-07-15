import { createFileRoute } from "@tanstack/react-router"

import { LeaderboardPage } from "@/components/pomoder/pomoder-pages"

export const Route = createFileRoute("/_pomoder/leaderboard")({
  component: LeaderboardPage,
})
