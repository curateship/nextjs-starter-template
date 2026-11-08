import { createFileRoute, getRouteApi } from "@tanstack/react-router"

import { AdminDashboard, type AdminLoaded } from "@/components/admin-dashboard/admin-dashboard"
import { loadOverviewFigures } from "@/lib/admin-dashboard/overview-figures"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  adminRangeOf,
  adminTabOf,
  readAdminMediaSearch,
  readAdminSearch,
  readAdminUsersSearch,
  type AdminTab,
} from "@/lib/admin-dashboard/admin-search"
import type { AnalyticsRange } from "@/lib/analytics/range"
import { getAdminErrorMessage, loadOverviewWidgets } from "@/lib/api/admin-dashboard"
import { listFeedback } from "@/lib/api/feedback"
import { loadAdminMediaPage } from "@/lib/api/media/admin-media"
import { loadAdminUsersPage } from "@/lib/api/people/admin-users"

const authenticatedRoute = getRouteApi("/_authenticated")

/**
 * Admin: Overview, Users, Feedback and Media library as one three-panel
 * dashboard, picked from the left page's Dashboards block, with Plans and
 * Announcements in its ⋮ (Tyler, 8 Nov 2026).
 * `src/lib/admin-dashboard/admin-search.ts` says what each address key means.
 */
export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  validateSearch: readAdminSearch,
  // The section and the range only. Users and the Media library read their
  // first page here from the address and then ask again in place as the
  // search, filters and page change; Feedback reads the whole board here and
  // searches it in the browser. Either way typing never reads the whole
  // section again.
  loaderDeps: ({ search }) => ({ tab: adminTabOf(search), range: adminRangeOf(search) }),
  // Read again only when the tab or the range changes, or a tab asks
  // (`router.invalidate()`), never because a row was opened: pressing a
  // feedback row would otherwise read the whole board again. Kept for no
  // time once the dashboard is left, so coming back always reads fresh.
  shouldReload: false,
  gcTime: 0,
  loader: ({ deps, location }) => loadAdmin(deps, location.search as Record<string, unknown>),
  component: AdminDashboardRoute,
  errorComponent: routeErrorComponent(getAdminErrorMessage),
})

async function loadAdmin(
  { tab, range }: { tab: AdminTab; range: AnalyticsRange },
  search: Record<string, unknown>
): Promise<AdminLoaded> {
  if (tab === "users") {
    // The router types a loader's `location.search` as empty whatever the
    // schema says, so it is read back through the same checks.
    const users = readAdminUsersSearch(search)
    return {
      tab,
      users: await loadAdminUsersPage({
        search: users.q ?? "",
        role: users.role ?? "all",
        status: users.status ?? "all",
        sort: users.sort ?? "created",
        direction: users.direction ?? "desc",
        page: users.page ?? 1,
      }),
    }
  }
  if (tab === "feedback") return { tab, feedback: await listFeedback() }
  if (tab === "media") {
    // No page size: the server reads the configured rows-per-page and sends
    // it back, so the first page holds exactly what the list will show.
    const { owner } = readAdminMediaSearch(search)
    return { tab, media: await loadAdminMediaPage({ page: 1, ownerId: owner ?? "all" }) }
  }
  const [figures, widgets] = await Promise.all([loadOverviewFigures(range), loadOverviewWidgets("admin")])
  return { tab: "overview", figures, widgets }
}

function AdminDashboardRoute() {
  const { user } = authenticatedRoute.useLoaderData()
  return <AdminDashboard loaded={Route.useLoaderData()} search={Route.useSearch()} currentUserId={user.id} />
}
