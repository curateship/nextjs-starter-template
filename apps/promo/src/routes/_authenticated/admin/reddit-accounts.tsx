import { createFileRoute } from "@tanstack/react-router"

import { RedditAccountsDashboard } from "@/components/social/accounts/accounts-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getRedditAccountsErrorMessage,
  loadRedditAccounts,
} from "@/lib/api/social/reddit-accounts"

/**
 * Every Reddit account with its status, project, browser profile and proxy.
 * Under Projects in the left menu.
 */
export const Route = createFileRoute("/_authenticated/admin/reddit-accounts")({
  loader: () => loadRedditAccounts(false),
  component: RedditAccountsRoute,
  errorComponent: routeErrorComponent(getRedditAccountsErrorMessage),
})

function RedditAccountsRoute() {
  return <RedditAccountsDashboard initial={Route.useLoaderData()} />
}
