import { createFileRoute } from "@tanstack/react-router"

import { PhonesDashboard } from "@/components/phones/phones-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getPhoneErrorMessage, loadPhonesPage } from "@/lib/api/phones/phones"
import { readPhonesSearch } from "@/lib/phones/phones-search"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

/**
 * Every phone on the rack: the account on it, whether it is connected, its
 * carrier and when the rack last saw it. `?open=<id>` opens one in its
 * window, which is where a phone's bell notice and the Reddit accounts
 * dashboard's phone links lead. The filters and the search box live in the
 * address too (`?status=offline&kind=iphone&q=...`), so a link can open a
 * filtered list and the back button undoes a filter.
 */
export const Route = createFileRoute("/_authenticated/admin/phones")({
  validateSearch: (search: Record<string, unknown>) => ({ ...readOpenSearch(search), ...readPhonesSearch(search) }),
  loader: () => loadPhonesPage(),
  component: PhonesRoute,
  errorComponent: routeErrorComponent(getPhoneErrorMessage),
})

function PhonesRoute() {
  const { open, ...filters } = Route.useSearch()
  return <PhonesDashboard initial={Route.useLoaderData()} openId={open} filters={filters} />
}
