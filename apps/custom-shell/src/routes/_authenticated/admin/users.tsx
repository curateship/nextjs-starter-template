import { createFileRoute, getRouteApi } from "@tanstack/react-router"

import { AdminUsersDashboard } from "@/components/admin/admin-users-dashboard"
import {
  getAdminUserErrorMessage,
  loadAdminUsersPage,
} from "@/lib/api/admin-users"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/list-search"
import { routeErrorComponent } from "@/components/shell/route-error"

const authenticatedRoute = getRouteApi("/_authenticated")

export const USER_ROLE_FILTERS = ["all", "admin", "member"] as const
export const USER_STATUS_FILTERS = [
  "all",
  "active",
  "suspended",
  "pending_deletion",
] as const
export const USER_SORT_COLUMNS = [
  "name",
  "email",
  "role",
  "plan",
  "created",
] as const

type UsersSearch = {
  q?: string
  role?: (typeof USER_ROLE_FILTERS)[number]
  status?: (typeof USER_STATUS_FILTERS)[number]
  sort?: (typeof USER_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list state the address carries, every value checked before use. */
export function readUsersSearch(search: Record<string, unknown>): UsersSearch {
  return {
    q: readSearchText(search.q),
    role: readOneOf(search.role, USER_ROLE_FILTERS),
    status: readOneOf(search.status, USER_STATUS_FILTERS),
    sort: readOneOf(search.sort, USER_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/users")({
  validateSearch: readUsersSearch,
  // Deliberately no `loaderDeps`: the address seeds the first render, and the
  // table refetches in place from there, so watching it would fetch twice for
  // every keystroke. The router types a loader's `location.search` as empty
  // whatever the schema says, so it is read back through the same checks.
  //
  // No page size either: the server reads the configured rows-per-page and
  // sends it back, so the first page holds exactly what the table will show.
  loader: ({ location }) => {
    const search = readUsersSearch(location.search as Record<string, unknown>)
    return loadAdminUsersPage({
      search: search.q ?? "",
      role: search.role ?? "all",
      status: search.status ?? "all",
      sort: search.sort ?? "created",
      direction: search.direction ?? "desc",
      page: search.page ?? 1,
    })
  },
  component: AdminUsersRoute,
  errorComponent: routeErrorComponent(getAdminUserErrorMessage),
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
