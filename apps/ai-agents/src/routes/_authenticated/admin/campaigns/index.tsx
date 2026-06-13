import { createFileRoute } from "@tanstack/react-router"

import { CampaignsDashboard } from "@/components/campaigns-dashboard"

export const Route = createFileRoute("/_authenticated/admin/campaigns/")({
  component: CampaignsDashboard,
})
