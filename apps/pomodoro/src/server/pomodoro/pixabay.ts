import { z } from "zod"

/**
 * Pixabay's API, for "Import from Pixabay" (pixabay.com/api/docs). Pictures
 * and films only: Pixabay has no music API. See "Import from Pixabay" in
 * `workspace/docs/catalog-admin.md`.
 *
 * The key travels in the query string, as Pixabay requires, so no address
 * here is ever logged or put in an error. Pixabay answers a bad key with a 400
 * that says "Invalid or missing API key" (checked 9 Oct 2026), and an unknown
 * id with a 400 or an empty `hits`.
 */

export class PixabayNotFoundError extends Error {}
export class PixabayRateLimitedError extends Error {}
export class PixabayKeyRefusedError extends Error {}

const LOOKUP_TIMEOUT_MS = 15_000
/** A 300 MB film on a slow line; the claim times out at twelve minutes. */
const DOWNLOAD_TIMEOUT_MS = 8 * 60_000

const hitSchema = z.object({
  user: z.string().default(""),
  pageURL: z.string().default(""),
  tags: z.string().default(""),
})

const imageSchema = hitSchema.extend({ largeImageURL: z.string().min(1) })

const renditionSchema = z
  .object({ url: z.string().default(""), size: z.number().default(0) })
  .optional()

const videoSchema = hitSchema.extend({
  videos: z.object({ large: renditionSchema, medium: renditionSchema }),
})

type PixabayVideo = z.infer<typeof videoSchema>

export function fetchPixabayImage(key: string, id: string) {
  return lookUp("", key, id, imageSchema)
}

export function fetchPixabayVideo(key: string, id: string) {
  return lookUp("videos/", key, id, videoSchema)
}

async function lookUp<T>(
  path: "" | "videos/",
  key: string,
  id: string,
  schema: z.ZodType<T>
): Promise<T> {
  const url = new URL(`https://pixabay.com/api/${path}`)
  url.searchParams.set("key", key)
  url.searchParams.set("id", id)
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  })
  if (response.status === 429) throw new PixabayRateLimitedError("PIXABAY_RATE_LIMITED")
  if (response.status === 401 || response.status === 403)
    throw new PixabayKeyRefusedError("PIXABAY_KEY_REFUSED")
  if (response.status === 400 || response.status === 404) {
    const text = await response.text().catch(() => "")
    if (/api key/i.test(text)) throw new PixabayKeyRefusedError("PIXABAY_KEY_REFUSED")
    throw new PixabayNotFoundError("PIXABAY_NOT_FOUND")
  }
  if (!response.ok) throw new Error("PIXABAY_REQUEST_FAILED")
  const body: unknown = await response.json()
  const hits =
    body && typeof body === "object" && "hits" in body && Array.isArray(body.hits)
      ? body.hits
      : null
  if (!hits) throw new Error("PIXABAY_INVALID_RESPONSE")
  if (!hits.length) throw new PixabayNotFoundError("PIXABAY_NOT_FOUND")
  const hit = schema.safeParse(hits[0])
  if (!hit.success) throw new Error("PIXABAY_INVALID_RESPONSE")
  return hit.data
}

/**
 * The film to copy: the large one when Pixabay has it under the cap, else the
 * medium one, read from the `size` Pixabay gives before a byte is fetched.
 */
export function pickPixabayRendition(video: PixabayVideo, limitBytes: number) {
  return (
    [video.videos.large, video.videos.medium].find(
      (rendition) =>
        rendition?.url && rendition.size > 0 && rendition.size <= limitBytes
    ) ?? null
  )
}

/**
 * The bytes of one Pixabay file, refused past `limitBytes` while it arrives.
 *
 * The address came out of Pixabay's answer, so it must be https on a host
 * ending in pixabay.com, and a redirect is followed at most once, to a host
 * that passes the same check. Anything else would let an answer turn into a
 * request to somewhere else entirely.
 */
export async function downloadPixabayFile(address: string, limitBytes: number) {
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
  let target = pixabayFileUrl(address)
  for (let hop = 0; hop < 2; hop += 1) {
    const response = await fetch(target, { redirect: "manual", signal })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) break
      target = pixabayFileUrl(new URL(location, target).toString())
      continue
    }
    if (!response.ok || !response.body) break
    if (Number(response.headers.get("content-length")) > limitBytes)
      throw new Error("FILE_TOO_LARGE")
    return readCapped(response.body, limitBytes)
  }
  throw new Error("PIXABAY_DOWNLOAD_FAILED")
}

function pixabayFileUrl(value: string) {
  const url = new URL(value)
  const host = url.hostname.toLowerCase()
  if (url.protocol !== "https:" || (host !== "pixabay.com" && !host.endsWith(".pixabay.com")))
    throw new Error("PIXABAY_DOWNLOAD_FAILED")
  return url
}

async function readCapped(body: ReadableStream<Uint8Array>, limitBytes: number) {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limitBytes) {
      await reader.cancel()
      throw new Error("FILE_TOO_LARGE")
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
