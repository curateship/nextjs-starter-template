import { createFileRoute } from "@tanstack/react-router"

import { HistoryPage } from "@/components/pomodoro/history-page"

/** The focus report: stats, heatmap, trend, top tasks, sessions, CSV. */
export const Route = createFileRoute("/_pomodoro/history")({
  component: HistoryPage,
})
