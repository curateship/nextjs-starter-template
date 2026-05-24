export const ACTOR_MODEL = "gemini-2.5-flash-image"

export type ActorStatus = "active" | "inactive"

export type ActorPayload = {
  name: string
  prompt: string
  status: ActorStatus
  tags: string
  model: typeof ACTOR_MODEL
  referenceMediaId?: string | null
}
