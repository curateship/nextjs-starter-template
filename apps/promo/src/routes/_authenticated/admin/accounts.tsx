import { createFileRoute } from "@tanstack/react-router"

import { RedditAccountsDashboard } from "@/components/social/accounts/accounts-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getRedditAccountsErrorMessage, loadRedditAccounts } from "@/lib/api/social/reddit-accounts"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { isNetwork, type Network } from "@/lib/social/networks"

/**
 * Every account on every platform, with its status, project, browser profile
 * or phone, and proxy. Under Projects in the left menu, after Voices. Tyler,
 * 15 Oct 2026: "I think accounts should be on its own dashboard with platform
 * filtering". `?platform=reddit` is the Platform filter set to Reddit, which
 * is how Manage accounts in a project's Comment as dropdown arrives.
 * `?open=<id>` opens one account's settings window, where a phone's Accounts
 * card and the Bans dashboard lead.
 */
export const Route = createFileRoute("/_authenticated/admin/accounts")({
  validateSearch: (search: Record<string, unknown>): { platform?: Network; open?: string } => ({
    platform: isNetwork(search.platform) ? search.platform : undefined,
    ...readOpenSearch(search),
  }),
  loader: () => loadRedditAccounts(false),
  component: AccountsRoute,
  errorComponent: routeErrorComponent(getRedditAccountsErrorMessage),
})

function AccountsRoute() {
  const { platform, open } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <RedditAccountsDashboard
      initial={Route.useLoaderData()}
      platform={platform ?? null}
      onPlatformChange={(next) => void navigate({ search: (previous) => ({ ...previous, platform: next ?? undefined }), replace: true })}
      openId={open}
      onOpenChange={(next) => void navigate({ search: (previous) => ({ ...previous, open: next }), replace: true })}
    />
  )
}
