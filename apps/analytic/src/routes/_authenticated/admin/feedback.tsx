import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"

import { FeedbackDashboard } from "@/components/feedback-dashboard"
import { useShellRuntime } from "@/components/shell-layout"

export const Route = createFileRoute("/_authenticated/admin/feedback")({
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
