import type { ActorModelId } from "@/lib/actor-models"

export const FIRST_FRAME_ASPECT_RATIOS = ["9:16", "16:9", "1:1"] as const
export type FirstFrameAspectRatio = (typeof FIRST_FRAME_ASPECT_RATIOS)[number]

export const FIRST_FRAME_REFERENCE_SOURCES = ["actor", "media"] as const
export type FirstFrameReferenceSource =
  (typeof FIRST_FRAME_REFERENCE_SOURCES)[number]

export type FirstFramePayload = {
  name: string
  actorId: string
  prompt: string
  tags: string
  model: ActorModelId
  aspectRatio: FirstFrameAspectRatio
  referenceSource: FirstFrameReferenceSource
  referenceMediaId?: string | null
}
