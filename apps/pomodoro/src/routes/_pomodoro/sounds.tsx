import { createFileRoute } from "@tanstack/react-router"

import { SoundsPage } from "@/components/pomodoro/sounds-page"

/** The eight ambient loops; four free, four Pro. */
export const Route = createFileRoute("/_pomodoro/sounds")({
  component: SoundsPage,
})
