import { z } from "zod"

import {
  BROLL_CANDIDATES,
  BROLL_KEY_REFUSED_MESSAGE,
  BROLL_PEXELS_DOWN_MESSAGE,
  PEXELS_HOURLY_LIMIT,
  isPexelsFileUrl,
  pickPexelsFile,
  pickPreviewFile,
  type BrollCandidate,
} from "@/lib/video/b-roll"

/**
 * Pexels, the free stock video library behind B-roll.
 *
 * One search is one request, whatever it finds. The free allowance is 200
 * requests an hour, so every request goes through one count kept for the
 * last hour, and a batch stops before it would go over rather than after
 * Pexels refuses. A refusal from Pexels (HTTP 429) stops it the same way.
 * Either way, what was found so far is kept and the rest waits.
 */

const SEARCH_URL = "https://api.pexels.com/videos/search"
const HOUR_MS = 60 * 60_000

/**
 * Results asked for per search. More than the four shown, because a clip
 * with no 720p copy is left out. Still one request.
 */
const SEARCH_PAGE_SIZE = 10

/** Searches at once in a batch, so 14 rows come back in a few seconds. */
const SEARCHES_AT_ONCE = 4

/** The library's own limit on a video file (`validateMediaFile`). */
const DOWNLOAD_MAX_BYTES = 100 * 1024 * 1024

export const PEXELS_HOURLY_LIMIT_MESSAGE = `Pexels allows ${PEXELS_HOURLY_LIMIT} searches an hour, and this hour's are used up.`
export const PEXELS_RATE_LIMITED_MESSAGE =
  "Pexels says too many searches were sent this hour."

type Fetch = typeof fetch

const fileSchema = z.object({
  link: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  file_type: z.string().nullable().optional(),
})

const answerSchema = z.object({
  videos: z.array(
    z.object({
      id: z.number(),
      url: z.string(),
      image: z.string(),
      duration: z.number(),
      width: z.number(),
      height: z.number(),
      user: z.object({ name: z.string(), url: z.string() }),
      video_files: z.array(fileSchema),
    })
  ),
})

/** When each request of the last hour was sent, oldest first. */
const sentAt: number[] = []

function forgetOlderThanAnHour(nowMs: number) {
  while (sentAt.length && sentAt[0] <= nowMs - HOUR_MS) sentAt.shift()
}

/**
 * Counts one request against the hour, or says when the next one may go.
 * The count lives in the web process. A restart forgets it, and Pexels' own
 * 429 is the backstop for that.
 */
function takeRequest(nowMs: number): { ok: true } | { ok: false; retryAtMs: number } {
  forgetOlderThanAnHour(nowMs)
  if (sentAt.length >= PEXELS_HOURLY_LIMIT) {
    return { ok: false, retryAtMs: sentAt[0] + HOUR_MS }
  }
  sentAt.push(nowMs)
  return { ok: true }
}

/** Only for tests: starts the hour's count from nothing. */
export function forgetPexelsRequests() {
  sentAt.length = 0
}

class PexelsStop extends Error {
  readonly retryAtMs: number | null
  constructor(message: string, retryAtMs: number | null) {
    super(message)
    this.retryAtMs = retryAtMs
  }
}

async function searchOnce({
  apiKey,
  query,
  orientation,
  perPage,
  fetchImpl,
}: {
  apiKey: string
  query: string
  orientation: "portrait" | "landscape" | "square"
  perPage: number
  fetchImpl: Fetch
}): Promise<BrollCandidate[]> {
  const nowMs = Date.now()
  const taken = takeRequest(nowMs)
  if (!taken.ok) throw new PexelsStop(PEXELS_HOURLY_LIMIT_MESSAGE, taken.retryAtMs)

  const url = new URL(SEARCH_URL)
  url.searchParams.set("query", query)
  url.searchParams.set("orientation", orientation)
  url.searchParams.set("per_page", String(perPage))
  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    console.error("Pexels search", error)
    throw new PexelsStop(BROLL_PEXELS_DOWN_MESSAGE, null)
  }
  if (response.status === 401 || response.status === 403) {
    throw new PexelsStop(BROLL_KEY_REFUSED_MESSAGE, null)
  }
  if (response.status === 429) {
    const reset = Number(response.headers.get("X-Ratelimit-Reset"))
    // Pexels' reset header is the month's, so an hour is the honest guess.
    const retryAtMs =
      Number.isFinite(reset) && reset * 1000 > nowMs && reset * 1000 - nowMs < HOUR_MS
        ? reset * 1000
        : nowMs + HOUR_MS
    throw new PexelsStop(PEXELS_RATE_LIMITED_MESSAGE, retryAtMs)
  }
  if (!response.ok) {
    console.error("Pexels search", response.status)
    throw new PexelsStop(BROLL_PEXELS_DOWN_MESSAGE, null)
  }
  const parsed = answerSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) {
    console.error("Pexels search came back in an unexpected shape")
    throw new PexelsStop(BROLL_PEXELS_DOWN_MESSAGE, null)
  }

  const candidates: BrollCandidate[] = []
  for (const video of parsed.data.videos) {
    const file = pickPexelsFile(video.video_files)
    const preview = pickPreviewFile(video.video_files)
    if (!file || !preview) continue
    candidates.push({
      pexelsId: video.id,
      pageUrl: video.url,
      photographer: video.user.name,
      photographerUrl: video.user.url,
      pictureUrl: video.image,
      previewUrl: preview.link,
      fileUrl: file.link,
      width: file.width ?? video.width,
      height: file.height ?? video.height,
      durationMs: Math.round(video.duration * 1000),
    })
    if (candidates.length === BROLL_CANDIDATES) break
  }
  return candidates
}

export type PexelsBatch = {
  /** Each searched row's clips, by row id. A row left out was not searched. */
  found: Record<string, BrollCandidate[]>
  /** Why the batch stopped before the end, and when to try the rest. */
  stopped: { message: string; retryAtMs: number | null } | null
}

/**
 * Searches each row's phrase once, a few at a time, in order. The first stop
 * (the hour used up, Pexels refusing, the key refused) ends the batch, and
 * every row not yet searched is left for "Search the rest".
 */
export async function searchPexelsRows({
  apiKey,
  rows,
  orientation,
  fetchImpl = fetch,
}: {
  apiKey: string
  rows: { id: string; phrase: string }[]
  orientation: "portrait" | "landscape" | "square"
  fetchImpl?: Fetch
}): Promise<PexelsBatch> {
  const found: Record<string, BrollCandidate[]> = {}
  let stopped: PexelsBatch["stopped"] = null
  let next = 0
  async function worker() {
    while (!stopped && next < rows.length) {
      const row = rows[next]
      next += 1
      try {
        found[row.id] = await searchOnce({
          apiKey,
          query: row.phrase,
          orientation,
          perPage: SEARCH_PAGE_SIZE,
          fetchImpl,
        })
      } catch (error) {
        if (!(error instanceof PexelsStop)) throw error
        stopped ??= { message: error.message, retryAtMs: error.retryAtMs }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SEARCHES_AT_ONCE, rows.length) }, worker)
  )
  return { found, stopped }
}

/** Asks for one result, which is all a key test needs. */
export async function testPexelsKey(
  apiKey: string,
  fetchImpl: Fetch = fetch
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await searchOnce({
      apiKey,
      query: "nature",
      orientation: "landscape",
      perPage: 1,
      fetchImpl,
    })
    return { ok: true }
  } catch (error) {
    if (error instanceof PexelsStop) return { ok: false, message: error.message }
    throw error
  }
}

/**
 * One Pexels file, downloaded on the server. Only Pexels' video host is
 * fetched, and a redirect away from it is refused, so an address sent from
 * the browser can never make the server fetch anything else. Files over the
 * library's 100MB limit are refused before they are read whole.
 */
export async function downloadPexelsFile(
  address: string,
  fetchImpl: Fetch = fetch
): Promise<Uint8Array> {
  if (!isPexelsFileUrl(address)) throw new Error("Not a Pexels file address")
  const response = await fetchImpl(address, {
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok || !response.body) {
    throw new Error(`Pexels file download failed (HTTP ${response.status})`)
  }
  const declared = Number(response.headers.get("Content-Length"))
  if (Number.isFinite(declared) && declared > DOWNLOAD_MAX_BYTES) {
    throw new Error("Pexels file is over the library's 100MB limit")
  }
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > DOWNLOAD_MAX_BYTES) {
      await reader.cancel()
      throw new Error("Pexels file is over the library's 100MB limit")
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
