import { createFileRoute, getRouteApi } from "@tanstack/react-router"

import { AdminUsersDashboard } from "@/components/admin-users-dashboard"
import { useShellRuntime } from "@/components/shell-layout"
import { loadAdminUsersPage } from "@/lib/api/admin-users"

const authenticatedRoute = getRouteApi("/_authenticated")

export const Route = createFileRoute("/_authenticated/admin/users")({
  loader: () => loadAdminUsersPage({ page: 1, pageSize: 25 }),
  component: AdminUsersRoute,
})

function AdminUsersRoute() {
  const { accounts, plans } = Route.useLoaderData()
  const { user } = authenticatedRoute.useLoaderData()
  const runtime = useShellRuntime()

  return (
    <AdminUsersDashboard
      initialAccounts={accounts.accounts}
      initialTotal={accounts.total}
      plans={plans}
      currentUserId={user.id}
      defaultPageSize={runtime.config.dashboardRowsPerPage}
    />
  )
}
