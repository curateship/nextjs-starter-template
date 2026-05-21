import { createFileRoute, redirect } from "@tanstack/react-router"

import { ProxiesDashboard } from "@/components/proxies-dashboard"
import { loadCurrentUser } from "@/lib/api/auth"
import { listProxies } from "@/lib/api/proxies"

export const Route = createFileRoute("/_authenticated/admin/proxies")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (user?.role !== "admin") {
      throw redirect({ to: "/" })
    }

    return listProxies()
  },
  component: ProxiesRoute,
})

function ProxiesRoute() {
  const { proxies } = Route.useLoaderData()
  return <ProxiesDashboard initialProxies={proxies} />
}
