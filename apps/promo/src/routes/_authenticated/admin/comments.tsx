import { createFileRoute } from "@tanstack/react-router"

import { CommentsDashboard, type CommentsTab } from "@/components/social/comments/comments-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getCommentsErrorMessage, loadComments, loadFailures } from "@/lib/api/social/comments"
import { loadOwnPosts } from "@/lib/api/social/reddit/own-posts"

type CommentsSearch = { tab?: CommentsTab; replies?: string; comment?: string }

/** Ids are ours, so anything that is not a short plain id is dropped. */
function id(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,40}$/.test(value) ? value : undefined
}

/**
 * Every comment the app has sent, and what became of it, with the ones that
 * did not go out on a tab of their own. Under Projects in the left menu.
 *
 * `?tab=posts` opens posts of your own, `?tab=failed` the Failed tab, `?replies=<id>` a comment's Replies
 * window and `?comment=<id>` that one comment: where the bell's notices lead.
 */
export const Route = createFileRoute("/_authenticated/admin/comments")({
  validateSearch: (search: Record<string, unknown>): CommentsSearch => ({
    tab: search.tab === "failed" || search.tab === "posts" ? search.tab : undefined,
    replies: id(search.replies),
    comment: id(search.comment),
  }),
  loader: async () => {
    const [comments, failures, posts] = await Promise.all([loadComments(), loadFailures(), loadOwnPosts()])
    return { comments, failures, posts }
  },
  component: CommentsRoute,
  errorComponent: routeErrorComponent(getCommentsErrorMessage),
})

function CommentsRoute() {
  const { tab, replies, comment } = Route.useSearch()
  return (
    <CommentsDashboard
      initial={Route.useLoaderData()}
      tab={tab ?? "sent"}
      repliesId={replies}
      commentId={comment}
    />
  )
}
