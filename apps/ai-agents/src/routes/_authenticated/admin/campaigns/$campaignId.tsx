import { createFileRoute } from "@tanstack/react-router"

import { CampaignDetail } from "@/components/campaign-detail"
import { getCampaignDetail } from "@/lib/api/campaigns"

export const Route = createFileRoute("/_authenticated/admin/campaigns/$campaignId")({
  loader: async ({ params }) => getCampaignDetail(params.campaignId),
  component: CampaignDetailRoute,
})

function CampaignDetailRoute() {
  const detail = Route.useLoaderData()
  // Remount when navigating between campaigns so poll state resets.
  return <CampaignDetail key={detail.campaign.id} initial={detail} />
}
