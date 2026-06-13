import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { idSchema, makeSafeErrorMessage, nameSchema } from "@/lib/api/shared"

import type {
  CampaignDetailResponse,
  CampaignItem,
  CampaignListResponse,
  CampaignRecipientItem,
  CampaignStats,
} from "@/server/campaigns"

export type {
  CampaignDetailResponse,
  CampaignItem,
  CampaignListResponse,
  CampaignRecipientItem,
  CampaignStats,
}

const campaignIdSchema = z.object({ campaignId: idSchema })

export const getCampaignErrorMessage = makeSafeErrorMessage(
  "Campaign request failed.",
  new Set([
    "Campaign not found",
    "Campaign already launched",
    "Campaign is not running",
    "Campaign is not paused",
    "Pause the campaign before deleting it",
    "The contact list is empty",
    "Voice provider not configured",
    "Agent not found",
    "List not found",
    "Phone number not found",
  ])
)

const listCampaignsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CampaignListResponse> => {
    const { listCampaignsForCurrentUser } = await import("@/server/campaigns")
    return listCampaignsForCurrentUser()
  }
)

const getCampaignDetailFn = createServerFn({ method: "GET" })
  .inputValidator(campaignIdSchema)
  .handler(async ({ data }): Promise<CampaignDetailResponse> => {
    const { getCampaignDetailForCurrentUser } = await import("@/server/campaigns")
    return getCampaignDetailForCurrentUser(data.campaignId)
  })

const createCampaignFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: nameSchema,
      agentId: idSchema,
      contactListId: idSchema,
      phoneNumberId: idSchema,
    })
  )
  .handler(async ({ data }): Promise<CampaignItem> => {
    const { createCampaignForCurrentUser } = await import("@/server/campaigns")
    return createCampaignForCurrentUser(data)
  })

const launchCampaignFn = createServerFn({ method: "POST" })
  .inputValidator(campaignIdSchema)
  .handler(async ({ data }): Promise<CampaignDetailResponse> => {
    const { launchCampaignForCurrentUser } = await import("@/server/campaigns")
    return launchCampaignForCurrentUser(data.campaignId)
  })

const setCampaignPausedFn = createServerFn({ method: "POST" })
  .inputValidator(campaignIdSchema.extend({ paused: z.boolean() }))
  .handler(async ({ data }): Promise<CampaignDetailResponse> => {
    const { setCampaignPausedForCurrentUser } = await import("@/server/campaigns")
    return setCampaignPausedForCurrentUser(data.campaignId, data.paused)
  })

const tickCampaignFn = createServerFn({ method: "POST" })
  .inputValidator(campaignIdSchema)
  .handler(async ({ data }): Promise<CampaignDetailResponse> => {
    const { tickCampaignForCurrentUser } = await import("@/server/campaigns")
    return tickCampaignForCurrentUser(data.campaignId)
  })

const deleteCampaignFn = createServerFn({ method: "POST" })
  .inputValidator(campaignIdSchema)
  .handler(async ({ data }): Promise<void> => {
    const { deleteCampaignForCurrentUser } = await import("@/server/campaigns")
    return deleteCampaignForCurrentUser(data.campaignId)
  })

export function listCampaigns() {
  return listCampaignsFn()
}

export function getCampaignDetail(campaignId: string) {
  return getCampaignDetailFn({ data: { campaignId } })
}

export function createCampaign(input: {
  name: string
  agentId: string
  contactListId: string
  phoneNumberId: string
}) {
  return createCampaignFn({ data: input })
}

export function launchCampaign(campaignId: string) {
  return launchCampaignFn({ data: { campaignId } })
}

export function setCampaignPaused(campaignId: string, paused: boolean) {
  return setCampaignPausedFn({ data: { campaignId, paused } })
}

export function tickCampaign(campaignId: string) {
  return tickCampaignFn({ data: { campaignId } })
}

export function deleteCampaign(campaignId: string) {
  return deleteCampaignFn({ data: { campaignId } })
}
