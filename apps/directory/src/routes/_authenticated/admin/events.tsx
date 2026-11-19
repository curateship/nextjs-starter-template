import { createFileRoute } from "@tanstack/react-router"

import { EventsDashboard } from "@/components/events/events-dashboard/events-dashboard"
import { loadEventsSection } from "@/components/events/events-dashboard/load-section"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getEventsDashboardErrorMessage } from "@/lib/api/events/events-dashboard"
import { readEventsDashboardSearch } from "@/lib/events/events-dashboard-search"
import { EVENTS_PLACE_KEY } from "@/lib/events/events-panel-keys"
import { restoreDashboardPlace } from "@/lib/layout/dashboard-place"

/**
 * The Events dashboard (task events/37, Part 1): Admin → Events as one
 * three-panel dashboard, as Listings is. `?open=<id>` still opens one event,
 * so every link made to the old Events page keeps working.
 * `src/lib/events/events-dashboard-search.ts` says what the address holds.
 */
export const Route = createFileRoute("/_authenticated/admin/events")({
  // Drawn in the browser only, as the Listings dashboard is: on the server
  // the shell's three-panel frame has no Settings → Styling to read, and
  // drew the side panels at other widths than the browser then did.
  ssr: false,
  beforeLoad: ({ search, location, matches, cause }): void =>
    restoreDashboardPlace(EVENTS_PLACE_KEY, { search, location, matches, cause }),
  validateSearch: readEventsDashboardSearch,
  // Everything except `open`: a record loads itself, so opening one never
  // reads the list underneath again.
  loaderDeps: ({ search: { open: _open, ...rest } }) => rest,
  loader: ({ deps }) => loadEventsSection(deps),
  component: AdminEventsRoute,
  errorComponent: routeErrorComponent(getEventsDashboardErrorMessage),
})

function AdminEventsRoute() {
  return <EventsDashboard loaded={Route.useLoaderData()} search={Route.useSearch()} />
}
