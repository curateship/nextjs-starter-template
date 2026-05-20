import { createFileRoute } from "@tanstack/react-router"

import { FeedbackCommentsDashboard } from "@/components/feedback-comments-dashboard"

export const Route = createFileRoute("/_authenticated/admin/feedback/comments")({
  component: FeedbackCommentsRoute,
})

function FeedbackCommentsRoute() {
  return <FeedbackCommentsDashboard />
}
