import { createFileRoute } from "@tanstack/react-router"

import { FeedbackCommentsDashboard } from "@/components/feedback-comments-dashboard"
import { requireAdminRoute } from "@/lib/admin-route"

export const Route = createFileRoute("/_authenticated/admin/feedback/comments")({
  loader: requireAdminRoute,
  component: FeedbackCommentsRoute,
})

function FeedbackCommentsRoute() {
  return <FeedbackCommentsDashboard />
}
