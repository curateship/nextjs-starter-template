import { createFileRoute } from "@tanstack/react-router"

import { FeedbackCommentsDashboard } from "@/components/feedback-comments-dashboard"
import { useShellRuntime } from "@/components/shell-layout"

export const Route = createFileRoute("/_authenticated/admin/feedback/comments")({
  component: FeedbackCommentsRoute,
})

function FeedbackCommentsRoute() {
  const runtime = useShellRuntime()

  return (
    <FeedbackCommentsDashboard refreshToken={runtime.feedbackRefreshToken} />
  )
}
