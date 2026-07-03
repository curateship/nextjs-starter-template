import { createFileRoute, redirect } from "@tanstack/react-router"

import { ApiUsageDashboard } from "@/components/api-usage-dashboard"
import { loadCurrentUser } from "@/lib/api/auth"

export const Route = createFileRoute("/_authenticated/admin/api-usage")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (user?.role !== "admin") {
      throw redirect({ to: "/" })
    }
  },
  component: ApiUsageDashboard,
})
