/* eslint-disable react-refresh/only-export-components */
import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router"

import { FeedbackDashboard } from "@/components/feedback-dashboard"
import { useShellRuntime } from "@/components/shell-layout"
import { loadCurrentUser } from "@/lib/api/auth"

export const Route = createFileRoute("/_authenticated/admin/feedback")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (user?.role !== "admin") throw redirect({ to: "/" })
  },
  component: FeedbackRoute,
})

function FeedbackRoute() {
  const runtime = useShellRuntime()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (pathname.endsWith("/comments")) {
    return <Outlet />
  }

  return (
    <FeedbackDashboard
      refreshToken={runtime.feedbackRefreshToken}
      onOpenFeedback={runtime.onOpenFeedback}
    />
  )
}
