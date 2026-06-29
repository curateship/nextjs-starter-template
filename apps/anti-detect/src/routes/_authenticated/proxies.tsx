import { createFileRoute } from "@tanstack/react-router"

import { ProxiesDashboard } from "@/components/proxies-dashboard"
import { loadProxies } from "@/lib/api/proxies"

export const Route = createFileRoute("/_authenticated/proxies")({
  loader: () => loadProxies(),
  component: ProxiesRoute,
})

function ProxiesRoute() {
  const { proxies } = Route.useLoaderData()
  return <ProxiesDashboard initialProxies={proxies} />
}
