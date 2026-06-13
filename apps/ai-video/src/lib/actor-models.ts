export type ActorStatus = "active" | "inactive"

// Image generation backends an actor can use. `provider` tells the server which
// API and saved key to use; the array order is the dropdown order.
export type ActorProvider = "gemini" | "openai"

export type ActorModelOption = {
  id: string
  label: string
  provider: ActorProvider
}

export const ACTOR_MODELS = [
  {
    id: "gemini-2.5-flash-image",
    label: "Nano Banana (Gemini)",
    provider: "gemini",
  },
  { id: "gpt-image-1", label: "GPT Image 1 (OpenAI)", provider: "openai" },
  { id: "dall-e-3", label: "DALL·E 3 (OpenAI)", provider: "openai" },
] as const satisfies readonly ActorModelOption[]

// Union of the allowed model ids, derived from the list above.
export type ActorModelId = (typeof ACTOR_MODELS)[number]["id"]

// Non-empty id tuple for zod's enum() validation.
export const ACTOR_MODEL_IDS = ACTOR_MODELS.map((model) => model.id) as [
  ActorModelId,
  ...ActorModelId[],
]

// The model selected by default in the Create Actor modal.
export const DEFAULT_ACTOR_MODEL: ActorModelId = "gemini-2.5-flash-image"

// Which provider a model id belongs to, or null when the id is unknown.
export function actorModelProvider(id: string): ActorProvider | null {
  return ACTOR_MODELS.find((model) => model.id === id)?.provider ?? null
}

export type ActorPayload = {
  name: string
  prompt: string
  status: ActorStatus
  tags: string
  model: ActorModelId
  referenceMediaId?: string | null
}
