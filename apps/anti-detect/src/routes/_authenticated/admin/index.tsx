import { createFileRoute } from "@tanstack/react-router"

import { Dashboard2Content } from "@/components/dashboard2"
import { requireAdminRoute } from "@/lib/admin-route"

export const Route = createFileRoute("/_authenticated/admin/")({
  loader: requireAdminRoute,
  component: Dashboard2Content,
})
