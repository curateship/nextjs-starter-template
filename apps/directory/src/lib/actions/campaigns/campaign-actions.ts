import { createServerFn } from "@tanstack/react-start"
import {
  deleteCampaignActionImpl,
  getSiteCampaignsActionImpl,
  saveCampaignActionImpl,
  setCampaignStatusActionImpl,
} from "./campaign-actions.server"
import type { CampaignInput, CampaignStatus } from "@/lib/campaigns/campaigns"

// getPublicCampaignsForSite is only called while the server renders the site
// layout, so it lives in campaign-actions.server.ts with no wrapper.

export const getSiteCampaignsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getSiteCampaignsActionImpl(data.siteId))

export const saveCampaignAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: CampaignInput; campaignId?: string }) => data)
  .handler(async ({ data }) => saveCampaignActionImpl(data.input, data.campaignId))

export const setCampaignStatusAction = createServerFn({ method: "POST" })
  .inputValidator((data: { campaignId: string; status: CampaignStatus }) => data)
  .handler(async ({ data }) => setCampaignStatusActionImpl(data.campaignId, data.status))

export const deleteCampaignAction = createServerFn({ method: "POST" })
  .inputValidator((data: { campaignId: string }) => data)
  .handler(async ({ data }) => deleteCampaignActionImpl(data.campaignId))
