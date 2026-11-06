import { createFileRoute } from "@tanstack/react-router"

import { RackWorkspace } from "@/components/phones/rack-workspace"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getPhoneErrorMessage, loadRackPage } from "@/lib/api/phones/phones"
import { loadSavedViews } from "@/lib/api/saved-views"
import { RACK_VIEW_KIND, readRackSearch, type RackSearch } from "@/lib/phones/rack-search"

/**
 * One rack's page (Racks dashboard, part 84): the rack on the left, its
 * phones in the middle, and the open phone with its screen on the right. The
 * open phone, the middle panel's tab, the search box and the filters live in the
 * address (`readRackSearch`). A rack that is gone draws its own message in
 * place of the page (part 86), never the route's error page.
 */
export const Route = createFileRoute("/_authenticated/admin/racks_/$rackId")({
  validateSearch: (search: Record<string, unknown>): RackSearch => readRackSearch(search),
  loader: async ({ params }) => {
    const [answer, views] = await Promise.all([
      loadRackPage(params.rackId),
      loadSavedViews(`${RACK_VIEW_KIND}:${params.rackId}`),
    ])
    return { answer, views }
  },
  errorComponent: routeErrorComponent(getPhoneErrorMessage),
  component: RackRoute,
})

function RackRoute() {
  const { answer, views } = Route.useLoaderData()
  return <RackWorkspace answer={answer} views={views} search={Route.useSearch()} />
}
