import { createFileRoute } from "@tanstack/react-router"

import { FeedbackDashboard } from "@/components/feedback/feedback-dashboard"
import { useShellRuntime } from "@/components/shell/shell-layout"

export const Route = createFileRoute("/_authenticated/admin/feedback")({
  component: FeedbackRoute,
})

function FeedbackRoute() {
  const runtime = useShellRuntime()

  return (
    <FeedbackDashboard
      refreshToken={runtime.feedbackRefreshToken}
      onOpenFeedback={runtime.onOpenFeedback}
    />
  )
}
