import { createFileRoute } from "@tanstack/react-router"

import { CommentsDashboard } from "@/components/social/comments/comments-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getCommentsErrorMessage, loadComments } from "@/lib/api/social/comments"

/**
 * Every comment the app has sent, and what became of it. Under Reddit in the
 * left menu.
 */
export const Route = createFileRoute("/_authenticated/admin/comments")({
  loader: () => loadComments(),
  component: CommentsRoute,
  errorComponent: routeErrorComponent(getCommentsErrorMessage),
})

function CommentsRoute() {
  return <CommentsDashboard initial={Route.useLoaderData()} />
}
