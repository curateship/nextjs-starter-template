import { createFileRoute, redirect } from "@tanstack/react-router"

import { ChangelogAdminDashboard } from "@/components/changelog/changelog-admin-dashboard"
import { loadAdminChangelog } from "@/lib/api/changelog"
import { readOpenSearch } from "@/lib/use-open-from-link"

/**
 * Where updates are written. Only an admin has anything to do here, so anyone
 * else is sent on to What's new — the page underneath this one that they came
 * to the changelog for anyway. Redirecting from the loader rather than
 * rendering a <Navigate> means they never paint an empty page first.
 */
export const Route = createFileRoute("/_authenticated/changelog/")({
  // `?open=<id>` is how the Overview links to one update.
  validateSearch: readOpenSearch,
  loader: async () => {
    const { entries } = await loadAdminChangelog()
    if (!entries) {
      throw redirect({ to: "/changelog/whats-new" })
    }
    return { entries }
  },
  component: ChangelogIndexRoute,
})

function ChangelogIndexRoute() {
  const { entries } = Route.useLoaderData()
  const { open } = Route.useSearch()

  return <ChangelogAdminDashboard initialEntries={entries} openId={open} />
}
