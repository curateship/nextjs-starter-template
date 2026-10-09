import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * Media became two pages on 8 Oct 2026, Themes and Sounds (admin task 02).
 * An old link or a saved menu entry still lands somewhere useful.
 */
export const Route = createFileRoute("/_authenticated/admin/pomodoro-media")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/pomodoro-themes", replace: true })
  },
})
