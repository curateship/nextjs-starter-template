import { createFileRoute } from "@tanstack/react-router"

import { BansDashboard } from "@/components/bans/bans-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getBansErrorMessage, loadBansPage } from "@/lib/api/bans"
import { readBansSearch } from "@/lib/bans/bans-search"

/**
 * Every ban in one list, under Anti Detect in the left menu after Phones
 * (Bans task, part 12). The filters and the open ban live in the address
 * (`?app=instagram&since=30&open=<id>`), so a bell notice or a project's
 * "banned in the last 30 days" link opens the same view.
 */
export const Route = createFileRoute("/_authenticated/admin/bans")({
  validateSearch: (search: Record<string, unknown>) => readBansSearch(search),
  loader: () => loadBansPage(),
  component: BansRoute,
  errorComponent: routeErrorComponent(getBansErrorMessage),
})

function BansRoute() {
  return <BansDashboard initial={Route.useLoaderData()} filters={Route.useSearch()} />
}
