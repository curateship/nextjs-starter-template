import { createFileRoute, getRouteApi } from "@tanstack/react-router"

import { AdminUsersDashboard } from "@/components/admin/admin-users-dashboard"
import { loadAdminUsersPage } from "@/lib/api/admin-users"

const authenticatedRoute = getRouteApi("/_authenticated")

export const Route = createFileRoute("/_authenticated/admin/users")({
  // No page size here: the server reads the configured rows-per-page and sends
  // it back, so the first page holds exactly what the table will show.
  loader: () => loadAdminUsersPage({ page: 1 }),
  component: AdminUsersRoute,
})

function AdminUsersRoute() {
  const { accounts, pageSize, plans } = Route.useLoaderData()
  const { user } = authenticatedRoute.useLoaderData()

  return (
    <AdminUsersDashboard
      initialAccounts={accounts.accounts}
      initialTotal={accounts.total}
      plans={plans}
      currentUserId={user.id}
      defaultPageSize={pageSize}
    />
  )
}
