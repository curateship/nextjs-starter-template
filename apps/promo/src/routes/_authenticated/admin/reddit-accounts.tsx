import { createFileRoute, redirect } from "@tanstack/react-router"

import { projectsDashboardSearch } from "@/lib/social/projects-dashboard-search"

/**
 * The Reddit accounts dashboard's old address, which the bell's suspended
 * account notice used. Every platform's accounts are the Projects
 * dashboard's Accounts section since 12 Nov 2026, so this opens it filtered
 * to Reddit.
 */
export const Route = createFileRoute("/_authenticated/admin/reddit-accounts")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/projects", search: projectsDashboardSearch("accounts", { platform: "reddit" }), replace: true })
  },
})
