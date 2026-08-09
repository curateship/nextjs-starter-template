export const IMAGE_MODELS = [
  { id: "gemini-2.5-flash-image", label: "Nano Banana" },
  { id: "gemini-3.1-flash-image", label: "Nano Banana 2" },
] as const

export const ACTOR_IMAGE_MODELS = [
  ...IMAGE_MODELS,
  { id: "gpt-image-2", label: "GPT Image 2 · OpenAI" },
] as const

export type GeminiImageModelId = (typeof IMAGE_MODELS)[number]["id"]
export type ImageModelId = (typeof ACTOR_IMAGE_MODELS)[number]["id"]
export const IMAGE_MODEL_IDS = IMAGE_MODELS.map((item) => item.id) as [
  GeminiImageModelId,
  ...GeminiImageModelId[],
]
export const ACTOR_IMAGE_MODEL_IDS = ACTOR_IMAGE_MODELS.map((item) => item.id) as [
  ImageModelId,
  ...ImageModelId[],
]
export const DEFAULT_IMAGE_MODEL: GeminiImageModelId = "gemini-2.5-flash-image"

export const ASSET_ASPECT_RATIOS = ["9:16", "16:9"] as const
export type AssetAspectRatio = (typeof ASSET_ASPECT_RATIOS)[number]

export const VIDEO_DURATIONS = [4, 6, 8] as const
export type VideoDurationSeconds = (typeof VIDEO_DURATIONS)[number]

export const VEO_MODEL = "veo-3.1-generate-preview"

export function imageProvider(model: ImageModelId): "gemini" | "openai" {
  return model === "gpt-image-2" ? "openai" : "gemini"
}

export function openAiImageSize(aspectRatio: AssetAspectRatio) {
  return aspectRatio === "9:16" ? "1024x1536" : "1536x1024"
}

export function normalizeAssetTags(value: string): string[] {
  const seen = new Set<string>()
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => {
      if (!tag || seen.has(tag)) return false
      seen.add(tag)
      return true
    })
    .slice(0, 30)
}

export function providerMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } }
    if (typeof parsed.error?.message === "string") {
      return parsed.error.message.replace(/\s+/g, " ").trim().slice(0, 300)
    }
  } catch {
    // A provider may answer with plain text. It is handled below.
  }
  return body.replace(/\s+/g, " ").trim().slice(0, 300)
}

export function assetName(value: string, noun: string): string {
  const cleaned = value.trim().replace(/\s+/g, " ")
  if (!cleaned) throw new Error(`${noun} name is required`)
  return cleaned.slice(0, 200)
}

export function assetPrompt(value: string): string {
  const cleaned = value.trim()
  if (!cleaned) throw new Error("Prompt is required")
  return cleaned.slice(0, 5000)
}
