import { formatCents } from "@/lib/video/project-spend"

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

/** The most pictures one actor's character sheet holds. */
export const MAX_SHEET_PICTURES = 12
export const MAX_SHEET_LABEL_LENGTH = 60

export const MAIN_PICTURE_REMOVE_MESSAGE =
  "Pick another main picture before removing this one."
export const SHEET_PICTURE_NOT_FOUND_MESSAGE =
  "That picture is no longer on this actor's sheet."
export const SHEET_FULL_MESSAGE = `An actor's sheet holds up to ${MAX_SHEET_PICTURES} pictures.`
export const SHEET_DUPLICATE_MESSAGE =
  "That picture is already on this actor's sheet."

/**
 * Names the actor pictures a first frame was drawn from, by their labels on
 * the sheet today. An unlabelled one is "main picture" or "unlabelled
 * picture", and one taken off the sheet since is "a removed picture".
 */
export function describeActorPictures(
  sentMediaIds: string[],
  sheet: { mediaId: string; label: string | null }[],
  mainMediaId: string
) {
  return sentMediaIds.map((mediaId) => {
    const picture = sheet.find((candidate) => candidate.mediaId === mediaId)
    if (!picture) return "a removed picture"
    if (picture.label) return picture.label
    return mediaId === mainMediaId ? "main picture" : "unlabelled picture"
  })
}

export const ASSET_ASPECT_RATIOS = ["9:16", "16:9"] as const
export type AssetAspectRatio = (typeof ASSET_ASPECT_RATIOS)[number]

/**
 * The shape a project's first frames and clips are made in: the project's own
 * when the picture models and Veo can make it, otherwise null, and the person
 * picks 9:16 or 16:9 for a square or 4:3 project.
 */
export function projectClipAspect(projectAspect: string): AssetAspectRatio | null {
  return (ASSET_ASPECT_RATIOS as readonly string[]).includes(projectAspect)
    ? (projectAspect as AssetAspectRatio)
    : null
}

/** A first frame's name from its scene line: the first few words, no more. */
export function sceneName(scene: string): string {
  const words = scene.trim().replace(/\s+/g, " ")
  return words.length > 60 ? `${words.slice(0, 57).trimEnd()}…` : words
}

export const VIDEO_DURATIONS = [4, 6, 8] as const
export type VideoDurationSeconds = (typeof VIDEO_DURATIONS)[number]

export const VEO_MODEL = "veo-3.1-generate-preview"

/**
 * The lengths a person can ask for. Google stops one clip at 8 seconds, so a
 * longer shot is made of 8 second pieces, each starting from the last frame of
 * the one before. `workspace/docs/longer-ai-clips.md` has the finding.
 */
export const SHOT_LENGTHS = [4, 6, 8, 16, 24, 32] as const
export type ShotLengthSeconds = (typeof SHOT_LENGTHS)[number]
const PIECE_SECONDS = 8

export function shotPieces(length: ShotLengthSeconds): {
  count: number
  seconds: VideoDurationSeconds
} {
  if (length <= PIECE_SECONDS) {
    return { count: 1, seconds: length as VideoDurationSeconds }
  }
  return { count: length / PIECE_SECONDS, seconds: PIECE_SECONDS }
}

/**
 * How many shots may be made at once: three in one project and six across one
 * person's projects. Every shot is paid for when it arrives, so without a cap
 * a run of presses is a bill nobody added up. Migration
 * 0117_video_shots_at_once.sql holds the same two numbers and the same two
 * sentences, and the database refuses a fourth even if two presses land
 * together. `workspace/docs/several-ai-clips.md` says why.
 */
export const SHOTS_AT_ONCE_PER_PROJECT = 3
export const SHOTS_AT_ONCE_PER_PERSON = 6
export const PROJECT_SHOTS_FULL_MESSAGE =
  "This project is already making 3 shots. Wait for one to finish."
export const PERSON_SHOTS_FULL_MESSAGE =
  "You are already making 6 shots across your projects. Wait for one to finish."

const ALLOWANCE_SHORT_START = "Your monthly AI allowance has"

/**
 * The refusal when a shot will not fit in what is left of the monthly
 * allowance. Shots still being made are paid for only when they arrive, so
 * they are counted here as already spoken for.
 */
export function shotAllowanceShortMessage({
  leftCents,
  generatingCents,
  nextCents,
}: {
  leftCents: number
  generatingCents: number
  nextCents: number
}) {
  const short = formatCents(generatingCents + nextCents - leftCents)
  const generating =
    generatingCents > 0
      ? ` Shots still being made will take ${formatCents(generatingCents)} of it, and this one costs ${formatCents(nextCents)}`
      : ` This shot costs ${formatCents(nextCents)}`
  return `${ALLOWANCE_SHORT_START} ${formatCents(leftCents)} left.${generating}, so it is ${short} short.`
}

export function isShotAllowanceShortMessage(message: string) {
  return message.startsWith(ALLOWANCE_SHORT_START)
}

export function imageProvider(model: ImageModelId): "gemini" | "openai" {
  return model === "gpt-image-2" ? "openai" : "gemini"
}

export function openAiImageSize(aspectRatio: AssetAspectRatio) {
  return aspectRatio === "9:16" ? "1024x1536" : "1536x1024"
}

export const MAX_ASSET_TAGS = 30

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
    .slice(0, MAX_ASSET_TAGS)
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
