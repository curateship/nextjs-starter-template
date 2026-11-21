import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { loadViralSection } from "@/components/viral/dashboard/load-section"
import { ViralDashboard } from "@/components/viral/dashboard/viral-dashboard"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { restoreDashboardPlace } from "@/lib/layout/dashboard-place"
import { VIRAL_PLACE_KEY } from "@/lib/viral/dashboard-keys"
import { readViralDashboardSearch } from "@/lib/viral/dashboard-search"

/**
 * The Viral dashboard (task features/03): Today, Projects, Vault and Library
 * as one three-panel dashboard, laid out as Directory's Events dashboard is.
 * The old addresses are gone, not forwarded (Tyler, 19 Nov 2026: "one entry
 * but dont need forward any links"). `src/lib/viral/dashboard-search.ts`
 * says what the address holds.
 */
export const Route = createFileRoute("/_authenticated/admin/viral")({
  // Drawn in the browser only, as Directory's dashboards are: on the server
  // the shell's three-panel frame has no Settings → Styling to read, and
  // drew the side panels at other widths than the browser then did.
  ssr: false,
  beforeLoad: ({ search, location, matches, cause }): void =>
    restoreDashboardPlace(VIRAL_PLACE_KEY, { search, location, matches, cause }),
  validateSearch: readViralDashboardSearch,
  // Everything except `open`: a record loads itself or comes from the list,
  // so opening one never reads the list underneath again.
  loaderDeps: ({ search: { open: _open, ...rest } }) => rest,
  loader: ({ deps }) => loadViralSection(deps),
  component: ViralDashboardRoute,
  errorComponent: routeErrorComponent(getViralErrorMessage),
})

function ViralDashboardRoute() {
  return <ViralDashboard loaded={Route.useLoaderData()} search={Route.useSearch()} />
}
