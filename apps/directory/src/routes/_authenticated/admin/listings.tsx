import { createFileRoute } from "@tanstack/react-router"

import { ListingsDashboard } from "@/components/directory/listings-dashboard/listings-dashboard"
import { loadListingsSection } from "@/components/directory/listings-dashboard/load-section"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getListingsDashboardErrorMessage } from "@/lib/api/directory/listings-dashboard"
import { readListingsSearch } from "@/lib/directory/listings-dashboard-search"
import { LISTINGS_PLACE_KEY } from "@/lib/directory/listings-panel-keys"
import { restoreDashboardPlace } from "@/lib/layout/dashboard-place"

/**
 * The Listings dashboard (Tyler, 18 Nov 2026: "Cosolidate listings into one
 * 3 panel dashboard. Match design pattern of the shell 1 to 1"). Every page
 * that stood on its own under Listings is a row of its Dashboards block now,
 * and its old address forwards here: `listing-fields`, `listing-submissions`,
 * `listing-claims`, `listing-reports`, `listing-featured`, `listing-guides`,
 * `listing-saves`, `listing-outreach` and `categories`.
 * `src/lib/directory/listings-dashboard-search.ts` says what the address
 * holds.
 */
export const Route = createFileRoute("/_authenticated/admin/listings")({
  // Drawn in the browser only. On the server the shell's three-panel frame
  // has no Settings → Styling to read, so it drew the side panels at other
  // widths than the browser then did, and React refused to patch the
  // difference (found by the browser check, 18 Nov 2026). A bare address
  // still goes back to where the dashboard was before anything loads
  // (`src/lib/layout/dashboard-place.ts`), which needs no server draw.
  ssr: false,
  beforeLoad: ({ search, location, matches, cause }): void =>
    restoreDashboardPlace(LISTINGS_PLACE_KEY, { search, location, matches, cause }),
  validateSearch: readListingsSearch,
  // Everything except `open`: a record loads itself, so opening one never
  // reads the list underneath again.
  loaderDeps: ({ search: { open: _open, ...rest } }) => rest,
  loader: ({ deps }) => loadListingsSection(deps),
  component: AdminListingsRoute,
  errorComponent: routeErrorComponent(getListingsDashboardErrorMessage),
})

function AdminListingsRoute() {
  return <ListingsDashboard loaded={Route.useLoaderData()} search={Route.useSearch()} />
}
