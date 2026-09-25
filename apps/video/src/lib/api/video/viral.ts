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
import {
  deleteOwnedViralSearches,
  getOwnedViralSearch,
  listOwnedViralSearches,
  runAndSaveViralSearch,
} from "@/server/video/viral/saved-searches"
import {
  VIRAL_KEYWORD_MAX,
  type ViralDays,
  type ViralSearchSummary,
  type ViralShort,
} from "@/lib/video/viral"

/**
 * The Viral page: type a keyword, see the YouTube Shorts about it. Admin only
 * — every search spends 102 of the day's 10,000 free YouTube units, so this
 * is not a door to leave open to every member.
 */

export type { ViralDays, ViralSearchSummary, ViralShort, YoutubeKeyStatus }

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
  /** Set means run a fresh search; blank spends nothing. */
  keyword: z.string().min(1).max(VIRAL_KEYWORD_MAX).optional(),
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  minViews: z.number().int().min(0).max(1_000_000_000),
  /** A saved search to reopen from the past-keywords list. */
  open: z.string().min(1).max(36).optional(),
})

export type ViralPageData = {
  keyConfigured: boolean
  /** The saved key exists but cannot be unscrambled any more. */
  keyUnreadable: boolean
  /** Every saved search, the one that ran last first. */
  searches: ViralSearchSummary[]
  results: ViralShort[]
  /** The saved search the results belong to — fresh or reopened. */
  open: ViralSearchSummary | null
  /**
   * True when the results were fetched from YouTube just now. The page then
   * swaps `?q=` for `?open=` in the address, so a reload shows the saved
   * copy instead of spending another 102 units.
   */
  fresh: boolean
  /** The search's failure as a finished sentence, never raw JSON. */
  error: string | null
}

const searchViralFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(searchSchema)
  .handler(async ({ data, context }): Promise<ViralPageData> => {
    const status = await getYoutubeKeyStatus()
    const base = {
      keyConfigured: status.configured,
      keyUnreadable: status.unreadable,
      open: null,
      fresh: false,
      error: null,
    }

    if (data.keyword && status.configured) {
      try {
        const key = await getYoutubeApiKey()
        if (key) {
          const saved = await runAndSaveViralSearch(
            context.user.id,
            { keyword: data.keyword, days: data.days, minViews: data.minViews },
            key
          )
          return {
            ...base,
            searches: await listOwnedViralSearches(context.user.id),
            results: saved.results,
            open: saved.search,
            fresh: true,
          }
        }
      } catch (error) {
        // The search failing is the page's answer, not a crash: the sentence
        // shows inside the table surface and the keyword box stays usable.
        return {
          ...base,
          searches: await listOwnedViralSearches(context.user.id),
          results: [],
          error: getViralErrorMessage(error),
        }
      }
    }

    const searches = await listOwnedViralSearches(context.user.id)
    if (data.open) {
      const found = await getOwnedViralSearch(context.user.id, data.open)
      if (!found) {
        return {
          ...base,
          searches,
          results: [],
          error: "That saved search is gone. Pick one from the list or run a new one.",
        }
      }
      return { ...base, searches, results: found.results, open: found.search }
    }
    return { ...base, searches, results: [] }
  })

export function loadViralSearch(input: {
  keyword?: string
  days: ViralDays
  minViews: number
  open?: string
}) {
  return searchViralFn({ data: input })
}

const deleteSearchesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ ids: z.array(z.string().min(1).max(36)).min(1).max(100) })
  )
  .handler(async ({ data, context }) => {
    const deleted = await deleteOwnedViralSearches(context.user.id, data.ids)
    return { deleted_ids: deleted }
  })

/** One request however many are ticked; the answer says which ones went. */
export function deleteViralSearches(ids: string[]) {
  return deleteSearchesFn({ data: { ids } })
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
