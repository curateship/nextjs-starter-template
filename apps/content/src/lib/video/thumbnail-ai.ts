import {
  GEMINI_PICTURE_TOKENS,
  PICTURE_READER_MODEL,
} from "@/lib/video/ai-estimates"
import { AI_MODEL_PRICES } from "@/lib/ai/ai-models"

/**
 * The words, limits and price sums of the Thumbnail board's AI
 * (thumbnails.md). The calls themselves are in src/server/video/thumbnail-ai.ts.
 */

/** One idea from the whole video: the moment, the words, the look (part 16). */
export type ThumbnailIdea = {
  atMs: number
  words: string
  expression: string
  background: string
}

export const IDEAS_NEED_WORDS_MESSAGE =
  "This video has no script or transcript yet. Open the Transcript panel and press Write it down, then ask again."
export const COPY_STYLE_LINK_MESSAGE =
  "That link isn't a YouTube video whose thumbnail can be read."
export const ACTOR_EXPRESSIONS = ["surprised", "pointing at the camera", "laughing", "worried", "thinking"] as const

/**
 * The 11 letters of a YouTube video's id from any of its link shapes:
 * watch?v=, youtu.be/, /shorts/ and /embed/. Null for anything else.
 */
export function youtubeVideoId(link: string): string | null {
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\.|^m\./, "")
  let id: string | null = null
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0] ?? null
  else if (host === "youtube.com" || host === "music.youtube.com") {
    id =
      url.searchParams.get("v") ??
      /^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname)?.[1] ??
      null
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}

const SMALL_WORDS = new Set(["the", "and", "for", "you", "your", "with", "this", "that", "are", "how", "why", "what", "was", "not", "but"])

/** The words worth comparing: three letters or more, not the little ones. */
function keyWords(text: string) {
  return new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter(
      (word) => word.length >= 3 && !SMALL_WORDS.has(word)
    )
  )
}

/** Whether a title says again a word the thumbnail already shows (part 20). */
export function repeatsThumbnailWords(title: string, onPicture: string) {
  const shown = keyWords(onPicture)
  for (const word of keyWords(title)) if (shown.has(word)) return true
  return false
}

/**
 * A translated line's size: smaller by as much as it grew, so a longer line
 * still fits its box, and never bigger than it was.
 */
export function translatedFontSize(size: number, before: string, after: string) {
  const grew = after.length / Math.max(1, before.length)
  return grew <= 1 ? size : Math.max(8, Math.round(size / grew))
}

function readerCents(inputTokens: number, outputTokens: number) {
  const price = AI_MODEL_PRICES[PICTURE_READER_MODEL]
  if (!price) return 0
  return ((inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1_000_000) * 100
}

/** Ideas from the video: its frames, its words and three ideas back. */
export function ideasCostCents(frames: number, wordsCharacters: number) {
  return readerCents(frames * GEMINI_PICTURE_TOKENS + 400 + wordsCharacters / 4, 500)
}

/** The check: the thumbnail twice, and three marks back. */
export function checkCostCents() {
  return readerCents(2 * GEMINI_PICTURE_TOKENS + 300, 300)
}

/** Copy a style: one picture, and its layout back. */
export function copyStyleCostCents() {
  return readerCents(GEMINI_PICTURE_TOKENS + 400, 600)
}
