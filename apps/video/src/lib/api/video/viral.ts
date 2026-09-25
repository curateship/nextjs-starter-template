import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  getYoutubeApiKey,
  getYoutubeKeyStatus,
  removeYoutubeApiKey,
  saveYoutubeApiKey,
  type YoutubeKeyStatus,
} from "@/server/video/settings"
import { searchYoutubeShorts } from "@/server/video/viral/youtube"
import {
  VIRAL_KEYWORD_MAX,
  type ViralDays,
  type ViralShort,
} from "@/lib/video/viral"

/**
 * The Viral page: type a keyword, see the YouTube Shorts about it. Admin only
 * — every search spends 102 of the day's 10,000 free YouTube units, so this
 * is not a door to leave open to every member.
 */

export type { ViralDays, ViralShort, YoutubeKeyStatus }

export const QUOTA_MESSAGE =
  "Today's 100 free YouTube searches are used up. They reset at midnight Pacific time."
const UNREACHABLE_MESSAGE =
  "YouTube could not be reached. Try again in a moment."

const describeKnownError = createErrorMessage(
  {
    YOUTUBE_QUOTA: QUOTA_MESSAGE,
    YOUTUBE_UNREACHABLE: UNREACHABLE_MESSAGE,
    EMPTY_KEY: "Paste a key before saving.",
    ENCRYPTION_NOT_CONFIGURED:
      "The server has no encryption key set, so secrets cannot be saved. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first.",
    SECRET_UNREADABLE:
      "The saved key can no longer be read. Paste it again in Settings → YouTube.",
  },
  "That did not work. Try again in a moment."
)

/**
 * Any refusal the search half did not word itself carries YouTube's own
 * reason as a "YouTube said: …" sentence, and that sentence is the answer —
 * the task's rule is that YouTube's reason reaches the screen, never raw JSON.
 */
export function getViralErrorMessage(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ""
  const said = message.indexOf("YouTube said:")
  if (said >= 0) return message.slice(said)
  return describeKnownError(error)
}

const searchSchema = z.object({
  /** Blank means the page just opened; nothing is searched or spent. */
  keyword: z.string().min(1).max(VIRAL_KEYWORD_MAX).optional(),
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  minViews: z.number().int().min(0).max(1_000_000_000),
})

export type ViralPageData = {
  keyConfigured: boolean
  /** The saved key exists but cannot be unscrambled any more. */
  keyUnreadable: boolean
  results: ViralShort[]
  /** The search's failure as a finished sentence, never raw JSON. */
  error: string | null
}

const searchViralFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(searchSchema)
  .handler(async ({ data }): Promise<ViralPageData> => {
    const status = await getYoutubeKeyStatus()
    const base = {
      keyConfigured: status.configured,
      keyUnreadable: status.unreadable,
    }
    if (!status.configured || !data.keyword) {
      return { ...base, results: [], error: null }
    }
    try {
      const key = await getYoutubeApiKey()
      if (!key) return { ...base, keyConfigured: false, results: [], error: null }
      const results = await searchYoutubeShorts(
        { keyword: data.keyword, days: data.days, minViews: data.minViews },
        key
      )
      return { ...base, results, error: null }
    } catch (error) {
      // The search failing is the page's answer, not a crash: the sentence
      // shows inside the table surface and the keyword box stays usable.
      return { ...base, results: [], error: getViralErrorMessage(error) }
    }
  })

export function loadViralSearch(input: {
  keyword?: string
  days: ViralDays
  minViews: number
}) {
  return searchViralFn({ data: input })
}

const getKeyStatusFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => getYoutubeKeyStatus())

export function loadYoutubeKeyStatus() {
  return getKeyStatusFn()
}

const saveKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ apiKey: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    await saveYoutubeApiKey(data.apiKey)
    return getYoutubeKeyStatus()
  })

export function saveYoutubeKey(apiKey: string) {
  return saveKeyFn({ data: { apiKey } })
}

const removeKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async () => {
    await removeYoutubeApiKey()
    return getYoutubeKeyStatus()
  })

export function removeYoutubeKey() {
  return removeKeyFn()
}
