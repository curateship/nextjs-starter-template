import { createFileRoute } from "@tanstack/react-router"

import { CreatorsDashboard } from "@/components/creators-dashboard"

export const Route = createFileRoute("/_authenticated/admin/creators/")({
  component: CreatorsDashboard,
})
