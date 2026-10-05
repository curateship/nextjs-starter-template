import { createFileRoute } from "@tanstack/react-router"

import { RedditWorkspace } from "@/components/social/reddit/workspace"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadBrowserStatus } from "@/lib/api/social/account"
import { getRedditErrorMessage, loadKeywords } from "@/lib/api/social/reddit/keywords"

/**
 * Finding Reddit posts worth answering, and answering them.
 *
 * The loader reads the two things the screen cannot draw without: the saved
 * keywords, and what the browser is doing. Everything else is fetched by the
 * panels, because a search takes tens of seconds and a loader that waited for
 * one would leave the page blank while it ran.
 */
export const Route = createFileRoute("/_authenticated/admin/reddit")({
  loader: async () => {
    const [keywords, status] = await Promise.all([
      loadKeywords(),
      loadBrowserStatus(),
    ])
    return { keywords, status }
  },
  errorComponent: routeErrorComponent(getRedditErrorMessage),
  component: RedditPage,
})

function RedditPage() {
  const { keywords, status } = Route.useLoaderData()

  return <RedditWorkspace initialKeywords={keywords} initialStatus={status} />
}
