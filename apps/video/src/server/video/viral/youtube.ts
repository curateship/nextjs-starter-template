/**
 * The Viral page's YouTube search: one keyword in, the matching Shorts out,
 * each with its numbers and its channel's subscriber count.
 *
 * The YouTube Data API gives 10,000 free units a day. One keyword costs
 * exactly 102 of them and never more: the search itself is 100, then one
 * batch call for up to 50 videos' numbers (1 unit) and one for their channels'
 * subscriber counts (1 unit). That is about 100 searches a day.
 *
 * The API's "short" length filter means under 4 minutes, so everything over
 * 3 minutes is dropped here to keep only real Shorts.
 *
 * The key travels in a header, never in the address — a key in an address
 * ends up in logs and proxy history.
 */

import {
  SHORT_MAX_SECONDS,
  type ViralDays,
  type ViralShort,
} from "@/lib/video/viral"

const API_BASE = "https://www.googleapis.com/youtube/v3"

export type ViralSearchInput = {
  keyword: string
  days: ViralDays
  minViews: number
}

/**
 * Searches YouTube for the keyword's Shorts. Throws YOUTUBE_QUOTA when the
 * day's units are used up, and `YouTube said: <reason>` for any other refusal,
 * so the toast has a sentence rather than raw JSON.
 */
export async function searchYoutubeShorts(
  input: ViralSearchInput,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<ViralShort[]> {
  const publishedAfter = new Date(
    Date.now() - input.days * 24 * 60 * 60 * 1000
  ).toISOString()

  const search = await callYoutube(
    fetchFn,
    apiKey,
    "search",
    new URLSearchParams({
      part: "id",
      type: "video",
      videoDuration: "short",
      order: "viewCount",
      publishedAfter,
      maxResults: "50",
      q: input.keyword,
    })
  )
  const videoIds = itemsOf(search)
    .map((item) => stringAt(item, ["id", "videoId"]))
    .filter((id): id is string => !!id)
  if (videoIds.length === 0) return []

  const videos = await callYoutube(
    fetchFn,
    apiKey,
    "videos",
    new URLSearchParams({
      part: "snippet,contentDetails,statistics",
      id: videoIds.join(","),
    })
  )
  const videoItems = itemsOf(videos)

  const channelIds = [
    ...new Set(
      videoItems
        .map((item) => stringAt(item, ["snippet", "channelId"]))
        .filter((id): id is string => !!id)
    ),
  ]
  const subscribers = new Map<string, number | null>()
  if (channelIds.length > 0) {
    const channels = await callYoutube(
      fetchFn,
      apiKey,
      "channels",
      new URLSearchParams({
        part: "statistics",
        id: channelIds.join(","),
      })
    )
    for (const item of itemsOf(channels)) {
      const id = stringAt(item, ["id"])
      if (!id) continue
      const hidden = valueAt(item, ["statistics", "hiddenSubscriberCount"])
      subscribers.set(
        id,
        hidden === true
          ? null
          : countAt(item, ["statistics", "subscriberCount"])
      )
    }
  }

  return videoItems
    .flatMap((item) => {
      const id = stringAt(item, ["id"])
      const channelId = stringAt(item, ["snippet", "channelId"])
      const duration = parseIsoDuration(
        stringAt(item, ["contentDetails", "duration"])
      )
      const views = countAt(item, ["statistics", "viewCount"])
      if (!id || !channelId || duration === null || views === null) return []
      if (duration > SHORT_MAX_SECONDS) return []
      if (views < input.minViews) return []
      return [
        {
          id,
          url: `https://www.youtube.com/shorts/${encodeURIComponent(id)}`,
          title: stringAt(item, ["snippet", "title"]) ?? "Untitled",
          channelId,
          channelTitle: stringAt(item, ["snippet", "channelTitle"]) ?? "",
          publishedAt: stringAt(item, ["snippet", "publishedAt"]) ?? "",
          thumbnailUrl:
            httpsOnly(stringAt(item, ["snippet", "thumbnails", "high", "url"])) ??
            httpsOnly(stringAt(item, ["snippet", "thumbnails", "medium", "url"])) ??
            httpsOnly(stringAt(item, ["snippet", "thumbnails", "default", "url"])) ??
            null,
          durationSeconds: duration,
          views,
          likes: countAt(item, ["statistics", "likeCount"]),
          comments: countAt(item, ["statistics", "commentCount"]),
          subscribers: subscribers.get(channelId) ?? null,
        },
      ]
    })
    .sort((a, b) => b.views - a.views)
}

/**
 * Who a YouTube channel is: its id, its name and its subscriber count.
 *
 * One unit. The handle has to be resolved to an id because listing somebody's
 * uploads needs the id, and a handle can be changed by its owner while the id
 * never moves.
 */
export async function resolveYoutubeChannel(
  lookup: { handle: string } | { channelId: string },
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<YoutubeChannel | null> {
  const params = new URLSearchParams({ part: "snippet,statistics" })
  if ("channelId" in lookup) params.set("id", lookup.channelId)
  else params.set("forHandle", `@${lookup.handle}`)

  const payload = await callYoutube(fetchFn, apiKey, "channels", params)
  const [item] = itemsOf(payload)
  if (!item) return null

  const id = stringAt(item, ["id"])
  if (!id) return null
  const hidden = valueAt(item, ["statistics", "hiddenSubscriberCount"])
  return {
    channelId: id,
    title: stringAt(item, ["snippet", "title"]) ?? null,
    handle: stringAt(item, ["snippet", "customUrl"])?.replace(/^@/, "") ?? null,
    subscribers:
      hidden === true ? null : countAt(item, ["statistics", "subscriberCount"]),
    avatarUrl:
      httpsOnly(stringAt(item, ["snippet", "thumbnails", "high", "url"])) ??
      httpsOnly(stringAt(item, ["snippet", "thumbnails", "default", "url"])) ??
      null,
  }
}

export type YoutubeChannel = {
  channelId: string
  title: string | null
  /** The @handle YouTube says is current, which may differ from the pasted one. */
  handle: string | null
  subscribers: number | null
  avatarUrl: string | null
}

export type YoutubeUpload = {
  platformVideoId: string
  url: string
  title: string | null
  thumbnailUrl: string | null
  durationSeconds: number | null
  views: number | null
  likes: number | null
  comments: number | null
  postedAt: Date | null
}

/**
 * A channel's newest uploads, with their numbers.
 *
 * Two units: one to read the uploads list, one batch call for the numbers.
 * Every channel's uploads live in a playlist whose id is the channel id with
 * its "UC" swapped for "UU" — a documented rule, and it saves asking.
 */
export async function listYoutubeChannelUploads(
  channelId: string,
  howMany: number,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<YoutubeUpload[]> {
  if (!channelId.startsWith("UC")) return []
  const uploadsPlaylistId = `UU${channelId.slice(2)}`

  const playlist = await callYoutube(
    fetchFn,
    apiKey,
    "playlistItems",
    new URLSearchParams({
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(Math.min(50, Math.max(1, howMany))),
    })
  )
  const videoIds = itemsOf(playlist)
    .map((item) => stringAt(item, ["contentDetails", "videoId"]))
    .filter((id): id is string => !!id)
  if (videoIds.length === 0) return []

  const videos = await callYoutube(
    fetchFn,
    apiKey,
    "videos",
    new URLSearchParams({
      part: "snippet,contentDetails,statistics",
      id: videoIds.join(","),
    })
  )

  return itemsOf(videos).flatMap((item) => {
    const id = stringAt(item, ["id"])
    if (!id) return []
    const published = stringAt(item, ["snippet", "publishedAt"])
    const postedAt = published ? new Date(published) : null
    return [
      {
        platformVideoId: id,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
        title: stringAt(item, ["snippet", "title"]) ?? null,
        thumbnailUrl:
          httpsOnly(stringAt(item, ["snippet", "thumbnails", "high", "url"])) ??
          httpsOnly(
            stringAt(item, ["snippet", "thumbnails", "medium", "url"])
          ) ??
          null,
        durationSeconds: parseIsoDuration(
          stringAt(item, ["contentDetails", "duration"])
        ),
        views: countAt(item, ["statistics", "viewCount"]),
        likes: countAt(item, ["statistics", "likeCount"]),
        comments: countAt(item, ["statistics", "commentCount"]),
        postedAt:
          postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
      },
    ]
  })
}

/** One API call, with YouTube's refusals turned into throwable sentences. */
async function callYoutube(
  fetchFn: typeof fetch,
  apiKey: string,
  resource: "search" | "videos" | "channels" | "playlistItems",
  params: URLSearchParams
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetchFn(`${API_BASE}/${resource}?${params}`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error("YOUTUBE_UNREACHABLE")
  }
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (!response.ok) {
    const error = (payload.error ?? {}) as Record<string, unknown>
    const reasons = Array.isArray(error.errors)
      ? (error.errors as Record<string, unknown>[]).map((one) => one.reason)
      : []
    if (
      reasons.includes("quotaExceeded") ||
      reasons.includes("dailyLimitExceeded")
    ) {
      throw new Error("YOUTUBE_QUOTA")
    }
    const message =
      typeof error.message === "string" && error.message.trim()
        ? error.message.trim()
        : `HTTP ${response.status}`
    throw new Error(`YouTube said: ${message}`)
  }
  return payload
}

function itemsOf(payload: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(payload.items)
    ? (payload.items as Record<string, unknown>[])
    : []
}

/** Walks a path into API JSON; anything missing on the way is undefined. */
function valueAt(item: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = item
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function stringAt(item: Record<string, unknown>, path: string[]) {
  const value = valueAt(item, path)
  return typeof value === "string" ? value : undefined
}

/**
 * An address the browser will be handed as an <img src>. It comes from an
 * outside API, so anything that is not plainly https is dropped rather than
 * rendered.
 */
function httpsOnly(value: string | undefined) {
  return value?.startsWith("https://") ? value : undefined
}

/** YouTube sends counts as strings; a missing one means the channel hides it. */
function countAt(item: Record<string, unknown>, path: string[]) {
  const value = valueAt(item, path)
  const count = typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(count) && count >= 0 ? count : null
}

/** "PT2M41S" → 161 seconds. Null when the string is not a duration. */
export function parseIsoDuration(value: string | undefined): number | null {
  if (!value) return null
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value)
  if (!match || (!match[1] && !match[2] && !match[3])) return null
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0)
  )
}
