import { createFileRoute } from "@tanstack/react-router"

import { RoomsPage } from "@/components/pomodoro/rooms-page"

/** Browse, host and run focus rooms. */
export const Route = createFileRoute("/_pomodoro/rooms")({
  component: RoomsPage,
})
