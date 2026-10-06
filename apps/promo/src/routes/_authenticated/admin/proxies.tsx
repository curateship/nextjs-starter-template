import { createFileRoute } from "@tanstack/react-router"

import { ProxiesDashboard } from "@/components/browser/proxies-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getProxyErrorMessage, loadProxies } from "@/lib/api/browser/proxies"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

/**
 * Every proxy the browser profiles can go out through. `?open=<id>` opens one,
 * which is where a dead-proxy notice in the bell leads.
 */
export const Route = createFileRoute("/_authenticated/admin/proxies")({
  validateSearch: readOpenSearch,
  loader: () => loadProxies(),
  component: ProxiesRoute,
  errorComponent: routeErrorComponent(getProxyErrorMessage),
})

function ProxiesRoute() {
  const { open } = Route.useSearch()
  return <ProxiesDashboard initial={Route.useLoaderData()} openId={open} />
}
