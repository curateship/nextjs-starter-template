import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { photoCreditSchema, type PhotoCredit } from "@/lib/travel/rules"

/**
 * Travel's calls to Unsplash, for activity pictures and trip covers. Server
 * only: the key never reaches the browser. The key is read on every call, so a
 * key added to the settings works without a restart.
 */

const TIMEOUT_MS = 10_000
const API = "https://api.unsplash.com"
export const UNSPLASH_PER_PAGE = 20

/**
 * The name Unsplash's rules ask for on every link back to them, as
 * `utm_source`. It should match the application name registered with the key.
 */
export const UNSPLASH_APP_NAME = "travel"

export type UnsplashPhoto = {
  id: string
  thumbUrl: string
  url: string
  width: number
  height: number
  credit: PhotoCredit
  /** Pinged once when the photo is picked, as Unsplash's rules require. */
  downloadLocation: string
}

export function unsplashEnabled(): boolean {
  return Boolean(process.env.UNSPLASH_ACCESS_KEY?.trim())
}

function unsplashKey(): string {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim()
  if (!key) throw new Error(TRAVEL_ERRORS.unsplashOff)
  return key
}

async function askUnsplash(url: string, key: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new Error(TRAVEL_ERRORS.unsplashFailed)
  }
  if (!response.ok) throw new Error(TRAVEL_ERRORS.unsplashFailed)
  try {
    return await response.json()
  } catch {
    throw new Error(TRAVEL_ERRORS.unsplashFailed)
  }
}

/** A link back to Unsplash with the referral tags their rules ask for. */
export function withReferral(link: string): string {
  const url = new URL(link)
  url.searchParams.set("utm_source", UNSPLASH_APP_NAME)
  url.searchParams.set("utm_medium", "referral")
  return url.toString()
}

const isImageUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("https://images.unsplash.com/")

/** One page of up to 20 photos for the words typed. A short page means there are no more. */
export async function searchPhotos(query: string, page: number): Promise<UnsplashPhoto[]> {
  const key = unsplashKey()
  const words = query.trim()
  if (!words) return []
  const url = new URL(`${API}/search/photos`)
  url.searchParams.set("query", words)
  url.searchParams.set("page", String(page))
  url.searchParams.set("per_page", String(UNSPLASH_PER_PAGE))
  url.searchParams.set("content_filter", "high")
  const body = (await askUnsplash(url.toString(), key)) as UnsplashSearch

  const photos: UnsplashPhoto[] = []
  for (const result of body.results ?? []) {
    const url = result.urls?.regular
    const thumbUrl = result.urls?.small ?? result.urls?.thumb
    const downloadLocation = result.links?.download_location
    if (!result.id || !isImageUrl(url) || !isImageUrl(thumbUrl)) continue
    if (!downloadLocation || !isDownloadLink(downloadLocation)) continue
    const credit = photoCreditSchema.safeParse({
      name: (result.user?.name ?? "").slice(0, 200),
      profileUrl: safeReferral(result.user?.links?.html),
      photoPageUrl: safeReferral(result.links?.html),
    })
    if (!credit.success || !credit.data.name) continue
    photos.push({
      id: result.id,
      thumbUrl,
      url,
      width: result.width ?? 0,
      height: result.height ?? 0,
      credit: credit.data,
      downloadLocation,
    })
  }
  return photos
}

function safeReferral(link: string | undefined): string {
  if (!link?.startsWith("https://unsplash.com/")) return ""
  try {
    return withReferral(link)
  } catch {
    return ""
  }
}

/** True only for an https address on api.unsplash.com, so the server can't be sent anywhere else. */
export function isDownloadLink(link: string): boolean {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return false
  }
  return (
    url.protocol === "https:" &&
    url.hostname === "api.unsplash.com" &&
    url.port === "" &&
    !url.username &&
    !url.password
  )
}

/**
 * Tells Unsplash a photo was picked. Their rules require it for every photo
 * used. Only Unsplash's own API address is called; anything else is refused.
 */
export async function trackDownload(downloadLocation: string): Promise<void> {
  const key = unsplashKey()
  if (!isDownloadLink(downloadLocation)) throw new Error(TRAVEL_ERRORS.unsplashBadLink)
  await askUnsplash(downloadLocation, key)
}

type UnsplashSearch = {
  results?: {
    id?: string
    width?: number
    height?: number
    urls?: { regular?: string; small?: string; thumb?: string }
    links?: { html?: string; download_location?: string }
    user?: { name?: string; links?: { html?: string } }
  }[]
}
