import { createFileRoute } from "@tanstack/react-router"

import { HomeRoom } from "@/components/pomodoro/home-room"

/**
 * The timer dashboard — the app's main screen, or the room you joined while
 * you are in one. Point the member home route (Settings → General) here so
 * signing in lands on it.
 */
export const Route = createFileRoute("/_pomodoro/timer")({
  component: HomeRoom,
})
