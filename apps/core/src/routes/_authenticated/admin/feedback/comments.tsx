import { createFileRoute } from "@tanstack/react-router"

import { FeedbackPage } from "@/components/feedback-page"
import { useShellRuntime } from "@/components/shell-layout"

export const Route = createFileRoute("/_authenticated/admin/feedback/comments")({
  component: FeedbackCommentsRoute,
})

function FeedbackCommentsRoute() {
  const runtime = useShellRuntime()
  return (
    <FeedbackPage
      refreshToken={runtime.feedbackRefreshToken}
      onOpenFeedback={runtime.onOpenFeedback}
      view="comments"
    />
  )
}
