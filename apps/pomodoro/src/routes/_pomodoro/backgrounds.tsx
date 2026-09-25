import { createFileRoute } from "@tanstack/react-router"

import { BackgroundsPage } from "@/components/pomodoro/backgrounds-page"

/** The eight background scenes; four free, four Pro. */
export const Route = createFileRoute("/_pomodoro/backgrounds")({
  component: BackgroundsPage,
})
