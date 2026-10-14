import { createFileRoute } from "@tanstack/react-router"

import { PhonesDashboard } from "@/components/phones/phones-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getPhoneErrorMessage, loadPhonesPage } from "@/lib/api/phones/phones"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

/**
 * Every phone on the rack: the account on it, whether it is connected, its
 * carrier and when the rack last saw it. `?open=<id>` opens one in its
 * window, which is where a phone's bell notice and the Reddit accounts
 * dashboard's phone links lead.
 */
export const Route = createFileRoute("/_authenticated/admin/phones")({
  validateSearch: readOpenSearch,
  loader: () => loadPhonesPage(),
  component: PhonesRoute,
  errorComponent: routeErrorComponent(getPhoneErrorMessage),
})

function PhonesRoute() {
  const { open } = Route.useSearch()
  return <PhonesDashboard initial={Route.useLoaderData()} openId={open} />
}
