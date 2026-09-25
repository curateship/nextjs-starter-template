import { createFileRoute } from "@tanstack/react-router"

import { TimerDashboard } from "@/components/pomodoro/timer-dashboard"

/**
 * The timer dashboard — the app's main screen. Point the member home route
 * (Settings → General) here so signing in lands on it.
 */
export const Route = createFileRoute("/_pomodoro/timer")({
  component: TimerDashboard,
})
