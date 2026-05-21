import { createFileRoute } from "@tanstack/react-router"

import { FeedbackCommentsDashboard } from "@/components/feedback-comments-dashboard"
import { listFeedbackCommentDashboard } from "@/lib/api/feedback"

export const Route = createFileRoute("/_authenticated/admin/feedback/comments")({
  loader: listFeedbackCommentDashboard,
  component: FeedbackCommentsRoute,
})

function FeedbackCommentsRoute() {
  const { comments } = Route.useLoaderData()
  return <FeedbackCommentsDashboard initialComments={comments} />
}
