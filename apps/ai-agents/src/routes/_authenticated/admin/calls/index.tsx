import { createFileRoute } from "@tanstack/react-router"

import { CallsDashboard } from "@/components/calls-dashboard"

export const Route = createFileRoute("/_authenticated/admin/calls/")({
  component: CallsDashboard,
})
