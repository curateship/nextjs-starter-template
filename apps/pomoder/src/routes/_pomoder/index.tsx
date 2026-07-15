import { createFileRoute } from "@tanstack/react-router"

import { PomodoroDashboard } from "@/components/pomoder/pomodoro-dashboard"

export const Route = createFileRoute("/_pomoder/")({
  component: PomodoroDashboard,
})
