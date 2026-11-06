import { createFileRoute } from "@tanstack/react-router"

import { RacksDashboard } from "@/components/phones/racks-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getPhoneErrorMessage, loadRacksPage } from "@/lib/api/phones/phones"

/**
 * Every rack as a table, where Racks in the left menu leads (Racks dashboard,
 * part 75). A row opens the rack's own page at `/admin/racks/$rackId`.
 * `?q=` is the search box, over racks and phones alike, and `?loose=1` opens
 * the phones that are on no rack.
 */
export const Route = createFileRoute("/_authenticated/admin/racks")({
  validateSearch: (search: Record<string, unknown>): { q?: string; loose?: "1" } => ({
    q: typeof search.q === "string" && search.q.trim() && search.q.length <= 200 ? search.q : undefined,
    loose: search.loose === "1" || search.loose === 1 ? "1" : undefined,
  }),
  loader: () => loadRacksPage(),
  errorComponent: routeErrorComponent(getPhoneErrorMessage),
  component: RacksRoute,
})

function RacksRoute() {
  return <RacksDashboard initial={Route.useLoaderData()} search={Route.useSearch()} />
}
