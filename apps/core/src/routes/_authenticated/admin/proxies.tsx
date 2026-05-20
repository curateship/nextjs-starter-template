import { createFileRoute, redirect } from "@tanstack/react-router"

import { ProxiesDashboard } from "@/components/proxies-dashboard"
import { loadCurrentUser } from "@/lib/api/auth"

export const Route = createFileRoute("/_authenticated/admin/proxies")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (user?.role !== "admin") {
      throw redirect({ to: "/" })
    }
  },
  component: ProxiesDashboard,
})
