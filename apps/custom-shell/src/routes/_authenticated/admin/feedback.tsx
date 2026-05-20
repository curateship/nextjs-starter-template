import { createFileRoute, useRouterState } from "@tanstack/react-router"

import { FeedbackPage } from "@/components/feedback-page"
import { useShellRuntime } from "@/components/shell-layout"

export const Route = createFileRoute("/_authenticated/admin/feedback")({
  component: FeedbackRoute,
})

function FeedbackRoute() {
  const runtime = useShellRuntime()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <FeedbackPage
      refreshToken={runtime.feedbackRefreshToken}
      onOpenFeedback={runtime.onOpenFeedback}
      view={pathname.endsWith("/comments") ? "comments" : "feedback"}
    />
  )
}
