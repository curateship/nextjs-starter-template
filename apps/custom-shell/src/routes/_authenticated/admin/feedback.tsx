import { createFileRoute } from "@tanstack/react-router"

import { FeedbackDashboard } from "@/components/feedback/feedback-dashboard"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { readOpenSearch } from "@/lib/use-open-from-link"

/** `?open=<id>` is how the feeds dashboard links to one piece of feedback. */
export const Route = createFileRoute("/_authenticated/admin/feedback")({
  validateSearch: readOpenSearch,
  component: FeedbackRoute,
})

function FeedbackRoute() {
  const runtime = useShellRuntime()
  const { open } = Route.useSearch()

  return (
    <FeedbackDashboard
      refreshToken={runtime.feedbackRefreshToken}
      onOpenFeedback={runtime.onOpenFeedback}
      openId={open}
    />
  )
}
