import { createFileRoute, redirect } from "@tanstack/react-router"

import { projectsDashboardSearch } from "@/lib/social/projects-dashboard-search"

/**
 * The Accounts dashboard's old address, which bell notices stored before
 * 12 Nov 2026 and older bookmarks use. Accounts is a section of the Projects
 * dashboard now, so this opens it with the same `?platform=` and `?open=`.
 */
export const Route = createFileRoute("/_authenticated/admin/accounts")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/projects", search: projectsDashboardSearch("accounts", search), replace: true })
  },
})
