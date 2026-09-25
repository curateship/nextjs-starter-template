import sharp from "sharp"

import {
  canResizeMediaUrl,
  isResizedMediaStoragePath,
  MEDIA_IMAGE_WIDTHS,
  resizedMediaStoragePath,
} from "@/lib/media/image-sizes"
import { storagePathForUrl } from "@/server/media/library"
import {
  getFromR2,
  getPublicMediaUrl,
  r2ObjectExists,
  uploadToR2,
} from "@/server/media/storage"

/** Matches the ceiling the favicon resizer already works to. */
const MAX_INPUT_PIXELS = 25_000_000

const CONTENT_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}

export type ResizedImageStorage = {
  toStoragePath: (url: string) => Promise<string | null>
  exists: (storagePath: string) => Promise<boolean>
  read: (storagePath: string) => Promise<Uint8Array>
  write: (
    storagePath: string,
    data: Uint8Array,
    contentType: string
  ) => Promise<void>
  publicUrl: (storagePath: string) => Promise<string>
}

const defaultStorage: ResizedImageStorage = {
  toStoragePath: storagePathForUrl,
  exists: r2ObjectExists,
  read: async (storagePath) => {
    const object = await getFromR2(storagePath)
    if (!object.Body) throw new Error("The image file is empty")
    return new Uint8Array(await object.Body.transformToByteArray())
  },
  write: uploadToR2,
  publicUrl: getPublicMediaUrl,
}

/**
 * One picture narrowed to `width`, or nothing when it is already narrower.
 *
 * The format is left alone. A JPEG comes back a JPEG and a PNG comes back a
 * PNG, so nothing an admin uploaded turns into a file their browser might not
 * show. The camera orientation is applied first, the same way the favicon sizes
 * do it, so a phone photo is not cut sideways.
 */
async function resizeImageToWidth(data: Uint8Array, width: number) {
  const source = sharp(data, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
  })
  const metadata = await source.metadata()
  const contentType = CONTENT_TYPES[metadata.format ?? ""]
  if (!contentType) return null

  // Orientations 5 to 8 turn the picture a quarter turn, so the width a viewer
  // sees is the stored height.
  const upright = (metadata.orientation ?? 1) >= 5
  const sourceWidth = upright ? metadata.height : metadata.width
  if (!sourceWidth || sourceWidth <= width) return null

  const resized = await source
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .toBuffer()

  return { data: new Uint8Array(resized), contentType }
}

/**
 * Sends the browser to a `width`-wide copy of a stored picture, cutting that
 * copy the first time anyone asks for it.
 *
 * It answers with a redirect rather than the bytes, so every request after the
 * first is a small round trip here and then the file itself straight off the
 * bucket's own network. Cutting on request rather than on upload is what makes
 * every picture already in the library work without a backfill.
 *
 * **Every failure ends at the original address.** A picture that is too big, a
 * format with no smaller copy worth cutting, a bucket that is not set up, a
 * `src` that is not ours: all of them redirect to what the page asked for, so a
 * page never shows a broken-image glyph because a resize went wrong.
 */
export async function resizedImageResponse(
  request: Request,
  storage: ResizedImageStorage = defaultStorage
) {
  const query = new URL(request.url).searchParams
  const source = query.get("src") ?? ""
  const width = Number(query.get("w"))

  if (!source || !canResizeMediaUrl(source)) {
    return badRequest("Not an image this app can resize")
  }
  // Only the widths the pages ask for. Without this, anyone could fill the
  // bucket with a copy of every picture at every width they can think of.
  if (!MEDIA_IMAGE_WIDTHS.some((allowed) => allowed === width)) {
    return badRequest("Unsupported width")
  }

  // Resolved before anything else and never inside the catch below. A `src`
  // outside our own bucket would make this an open image proxy, and a redirect
  // to it would send visitors to whatever address the query string named.
  const storagePath = await storage
    .toStoragePath(source)
    .catch(() => null)
  if (!storagePath) return badRequest("Not a file in this app's storage")
  // A copy asking for a copy of itself would go round forever.
  if (isResizedMediaStoragePath(storagePath)) return redirectTo(source)

  try {
    const copyPath = resizedMediaStoragePath(storagePath, width)
    if (await storage.exists(copyPath)) {
      return redirectTo(await storage.publicUrl(copyPath))
    }

    const cut = await cutOnce(copyPath, () =>
      cutCopy(storagePath, copyPath, width, storage)
    )
    if (!cut) return redirectTo(source)

    return redirectTo(await storage.publicUrl(copyPath))
  } catch {
    // A minute, not a year. A bucket that was briefly unreachable should not
    // pin every visitor to the original picture until their cache is cleared.
    return redirectTo(source, "public, max-age=60")
  }
}

/**
 * Cuts one copy and stores it, or reports that the picture needed no copy.
 */
async function cutCopy(
  storagePath: string,
  copyPath: string,
  width: number,
  storage: ResizedImageStorage
) {
  const resized = await resizeImageToWidth(
    await storage.read(storagePath),
    width
  )
  if (!resized) return false

  await storage.write(copyPath, resized.data, resized.contentType)
  return true
}

/** The cuts running right now, so the same one is never started twice. */
const cutsInFlight = new Map<string, Promise<boolean>>()

/**
 * Runs one cut at a time per copy, and hands everyone else waiting the same
 * answer.
 *
 * The first visitor to a page pays for the cut, and on a busy page that is
 * every visitor at once, all asking for the same file before any of them has
 * finished. Without this they each decode the full-size picture, which for a
 * 25 megapixel photo is the most expensive thing this app can be asked to do
 * without signing in.
 */
function cutOnce(copyPath: string, cut: () => Promise<boolean>) {
  const running = cutsInFlight.get(copyPath)
  if (running) return running

  const started = cut().finally(() => cutsInFlight.delete(copyPath))
  cutsInFlight.set(copyPath, started)
  return started
}

function redirectTo(
  url: string,
  cacheControl = "public, max-age=31536000, immutable"
) {
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": cacheControl },
  })
}

function badRequest(detail: string) {
  return Response.json({ detail }, { status: 400 })
}
