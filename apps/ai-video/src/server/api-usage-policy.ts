export {
  API_USAGE_LIMIT_MAX,
  API_USAGE_LIMIT_MIN,
} from "@/lib/api-usage-constants"

export const API_USAGE_WARNING_RATIO = 0.8

export const API_USAGE_PROVIDERS = [
  "gemini",
  "openai",
  "veo",
  "elevenlabs",
] as const

export const API_USAGE_FEATURES = [
  "text_generation",
  "caption_generation",
  "video_analysis",
  "voiceover",
  "image_generation",
  "ai_video_generation",
  "script_generation",
  "carousel_generation",
  "export_description",
] as const

export const API_USAGE_EVENT_STATUSES = [
  "success",
  "failed",
  "blocked",
] as const

export type ApiUsageProvider = (typeof API_USAGE_PROVIDERS)[number]
export type ApiUsageFeature = (typeof API_USAGE_FEATURES)[number]
export type ApiUsageEventStatus = (typeof API_USAGE_EVENT_STATUSES)[number]
export type ApiUsageLimitStatus = "normal" | "warning" | "blocked"
export type ApiUsageAlertLevel = "warning" | "blocked"

const API_USAGE_FEATURE_CREDITS: Record<ApiUsageFeature, number> = {
  text_generation: 1,
  caption_generation: 2,
  video_analysis: 2,
  voiceover: 5,
  image_generation: 10,
  ai_video_generation: 50,
  script_generation: 1,
  carousel_generation: 1,
  export_description: 1,
}

export function creditsForApiUsageFeature(feature: ApiUsageFeature) {
  return API_USAGE_FEATURE_CREDITS[feature]
}

export function apiUsagePeriodStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function apiUsageStatus(
  usedCredits: number,
  limitCredits: number
): ApiUsageLimitStatus {
  if (usedCredits >= limitCredits) return "blocked"
  if (usedCredits >= Math.ceil(limitCredits * API_USAGE_WARNING_RATIO)) {
    return "warning"
  }
  return "normal"
}

export function wouldCrossUsageThreshold(
  previousCredits: number,
  nextCredits: number,
  limitCredits: number,
  level: ApiUsageAlertLevel
) {
  const threshold =
    level === "blocked"
      ? limitCredits
      : Math.ceil(limitCredits * API_USAGE_WARNING_RATIO)

  return previousCredits < threshold && nextCredits >= threshold
}
