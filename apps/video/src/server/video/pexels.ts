import { z } from "zod"

import {
  PEXELS_DOWN_MESSAGE,
  PEXELS_HOURLY_LIMIT,
  PEXELS_KEY_REFUSED_MESSAGE,
} from "@/lib/video/pexels"

/**
 * Pexels, the free stock library behind the carousel's photo search.
 *
 * One search is one request, whatever it finds. The free allowance is 200
 * requests an hour, so every request goes through one count kept for the
 * last hour, and a search stops before it would go over rather than after
 * Pexels refuses. A refusal from Pexels (HTTP 429) stops it the same way.
 */

const PHOTO_SEARCH_URL = "https://api.pexels.com/v1/search"
const HOUR_MS = 60 * 60_000

/** The library's own limit on a picture. */
const PHOTO_MAX_BYTES = 10 * 1024 * 1024
/** Photos shown for one carousel search. */
const PHOTO_PAGE_SIZE = 24

export const PEXELS_HOURLY_LIMIT_MESSAGE = `Pexels allows ${PEXELS_HOURLY_LIMIT} searches an hour, and this hour's are used up.`
export const PEXELS_RATE_LIMITED_MESSAGE =
  "Pexels says too many searches were sent this hour."

type Fetch = typeof fetch

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

/**
 * One request to Pexels, counted against the hour, and its answer read as
 * JSON. Every way it can fail stops with the message to show.
 */
async function pexelsGet(
  address: URL,
  apiKey: string,
  fetchImpl: Fetch
): Promise<unknown> {
  const nowMs = Date.now()
  const taken = takeRequest(nowMs)
  if (!taken.ok) throw new PexelsStop(PEXELS_HOURLY_LIMIT_MESSAGE, taken.retryAtMs)

  let response: Response
  try {
    response = await fetchImpl(address, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    console.error("Pexels search", error)
    throw new PexelsStop(PEXELS_DOWN_MESSAGE, null)
  }
  if (response.status === 401 || response.status === 403) {
    throw new PexelsStop(PEXELS_KEY_REFUSED_MESSAGE, null)
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
    throw new PexelsStop(PEXELS_DOWN_MESSAGE, null)
  }
  return response.json().catch(() => null)
}

/** A Pexels photo as the carousel's photo search shows it. */
export type PexelsPhoto = {
  pexelsId: number
  pageUrl: string
  photographer: string
  photographerUrl: string
  /** A small copy for the grid. */
  previewUrl: string
  /** The copy that is downloaded onto the slide, about 1900 pixels across. */
  fileUrl: string
  width: number
  height: number
  alt: string
}

const photoAnswerSchema = z.object({
  photos: z.array(
    z.object({
      id: z.number(),
      url: z.string(),
      width: z.number(),
      height: z.number(),
      alt: z.string().nullable().optional(),
      photographer: z.string(),
      photographer_url: z.string(),
      src: z.object({ medium: z.string(), large2x: z.string() }),
    })
  ),
})

/**
 * Photos for one search, from Pexels' photo library. One request, counted
 * against the hour.
 */
export async function searchPexelsPhotos({
  apiKey,
  query,
  orientation,
  perPage = PHOTO_PAGE_SIZE,
  fetchImpl = fetch,
}: {
  apiKey: string
  query: string
  orientation: "portrait" | "landscape" | "square"
  perPage?: number
  fetchImpl?: Fetch
}): Promise<PexelsPhoto[]> {
  const url = new URL(PHOTO_SEARCH_URL)
  url.searchParams.set("query", query)
  url.searchParams.set("orientation", orientation)
  url.searchParams.set("per_page", String(perPage))
  let answer: unknown
  try {
    answer = await pexelsGet(url, apiKey, fetchImpl)
  } catch (error) {
    if (error instanceof PexelsStop) throw new Error(error.message)
    throw error
  }
  const parsed = photoAnswerSchema.safeParse(answer)
  if (!parsed.success) {
    console.error("Pexels photo search came back in an unexpected shape")
    throw new Error(PEXELS_DOWN_MESSAGE)
  }
  return parsed.data.photos.flatMap((photo) =>
    isPexelsPhotoUrl(photo.src.large2x) && isPexelsPhotoUrl(photo.src.medium)
      ? [
          {
            pexelsId: photo.id,
            pageUrl: photo.url,
            photographer: photo.photographer,
            photographerUrl: photo.photographer_url,
            previewUrl: photo.src.medium,
            fileUrl: photo.src.large2x,
            width: photo.width,
            height: photo.height,
            alt: photo.alt?.trim() ?? "",
          },
        ]
      : []
  )
}

/** Pexels' own picture host, the only place a photo is fetched from. */
export function isPexelsPhotoUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === "images.pexels.com"
  } catch {
    return false
  }
}

/** Asks for one result, which is all a key test needs. */
export async function testPexelsKey(
  apiKey: string,
  fetchImpl: Fetch = fetch
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await searchPexelsPhotos({
      apiKey,
      query: "nature",
      orientation: "landscape",
      perPage: 1,
      fetchImpl,
    })
    return { ok: true }
  } catch (error) {
    // Every refusal from Pexels is a sentence that starts with its name.
    if (error instanceof Error && error.message.startsWith("Pexels")) {
      return { ok: false, message: error.message }
    }
    throw error
  }
}

/**
 * One Pexels photo, downloaded on the server. Only Pexels' picture host is
 * fetched and a redirect away from it is refused, so an address sent from the browser can never make the
 * server fetch anything else. Files over the library's limit are refused
 * before they are read whole.
 */
export async function downloadPexelsPhoto(
  address: string,
  fetchImpl: Fetch = fetch
): Promise<Uint8Array> {
  if (!isPexelsPhotoUrl(address)) throw new Error("Not a Pexels photo address")
  return downloadCapped(address, PHOTO_MAX_BYTES, fetchImpl)
}

async function downloadCapped(
  address: string,
  maxBytes: number,
  fetchImpl: Fetch
): Promise<Uint8Array> {
  const response = await fetchImpl(address, {
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok || !response.body) {
    throw new Error(`Pexels file download failed (HTTP ${response.status})`)
  }
  const limit = `Pexels file is over the library's ${Math.round(maxBytes / 1024 / 1024)}MB limit`
  const declared = Number(response.headers.get("Content-Length"))
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(limit)
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(limit)
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
