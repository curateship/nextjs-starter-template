import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"

import { FeedbackDashboard } from "@/components/feedback-dashboard"
import { useShellRuntime } from "@/components/shell-layout"
import { listFeedback } from "@/lib/api/feedback"

export const Route = createFileRoute("/_authenticated/admin/feedback")({
  loader: listFeedback,
  component: FeedbackRoute,
})

function FeedbackRoute() {
  const { feedback } = Route.useLoaderData()
  const runtime = useShellRuntime()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (pathname.endsWith("/comments")) {
    return <Outlet />
  }

  return (
    <FeedbackDashboard
      initialFeedback={feedback}
      refreshToken={runtime.feedbackRefreshToken}
      onOpenFeedback={runtime.onOpenFeedback}
    />
  )
}
