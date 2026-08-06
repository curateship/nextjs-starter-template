import { createFileRoute } from "@tanstack/react-router"

import { AdminPlansDashboard } from "@/components/admin/admin-plans-dashboard"
import {
  getPlanErrorMessage,
  loadAdminPlans,
} from "@/lib/api/billing/admin-plans"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { routeErrorComponent } from "@/components/shell/route-error"

export const PLAN_SORT_COLUMNS = [
  "name",
  "monthly",
  "yearly",
  "stripe",
  "visibility",
] as const

type PlansSearch = {
  open?: string
  q?: string
  sort?: (typeof PLAN_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
}

/** The list state the address carries, every value checked before use. */
function readPlansSearch(search: Record<string, unknown>): PlansSearch {
  return {
    ...readOpenSearch(search),
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, PLAN_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/plans")({
  // Search, sort and page live in the address, so Back returns this exact list.
  validateSearch: readPlansSearch,
  loader: async () => ({ plans: await loadAdminPlans() }),
  component: AdminPlansRoute,
  errorComponent: routeErrorComponent(getPlanErrorMessage),
})

function AdminPlansRoute() {
  const { plans } = Route.useLoaderData()
  return <AdminPlansDashboard initialPlans={plans} />
}
