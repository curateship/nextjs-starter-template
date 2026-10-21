import type { CarouselFormat } from "@/lib/video/carousel-schema"
import { getOwnedCarouselDetail } from "@/server/video/carousels"
import {
  discardGeneratedAsset,
  saveGeneratedAsset,
} from "@/server/video/asset-factories/media"
import { attachMediaToScope } from "@/server/video/media-list"
import {
  STOCK_DOWNLOAD_FAILED_MESSAGE,
  STOCK_NO_KEY_MESSAGE,
} from "@/lib/video/stock-photos"
import {
  downloadPexelsPhoto,
  searchPexelsPhotos,
  type PexelsPhoto,
} from "@/server/video/pexels"
import { getPexelsApiKey } from "@/server/video/settings"

/**
 * Free stock photos for carousel slides, from Pexels: a search, then one
 * picked photo saved into the library and onto the carousel's shelf with the
 * photographer's credit as its description (workspace/docs/carousel-pictures.md).
 * The same key and the same hourly count as B-roll.
 */

// Pexels sorts by shape, so a tall slide asks for tall photos first.
function orientationFor(format: CarouselFormat) {
  return format === "1:1" ? ("square" as const) : ("portrait" as const)
}

export async function searchCarouselStockPhotos(
  userId: string,
  carouselId: string,
  query: string,
  search: typeof searchPexelsPhotos = searchPexelsPhotos
): Promise<PexelsPhoto[]> {
  const carousel = await getOwnedCarouselDetail(userId, carouselId)
  const apiKey = await getPexelsApiKey()
  if (!apiKey) throw new Error(STOCK_NO_KEY_MESSAGE)
  return search({ apiKey, query, orientation: orientationFor(carousel.format) })
}

/** The words a kept photo carries as its description: who took it, and where. */
export function stockCredit(photo: {
  photographer: string
  photographerUrl: string
  pageUrl: string
}) {
  const by = photo.photographer.trim() || "an unnamed photographer"
  const credit = `Photo by ${by} on Pexels: ${photo.pageUrl} (photographer: ${photo.photographerUrl})`
  // The longest description a picture layer keeps.
  return credit.slice(0, 500)
}

function pictureType(bytes: Uint8Array) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png"
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg"
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp"
  return null
}

/**
 * Downloads one photo, keeps it in the library and on this carousel's shelf,
 * and answers it for the editor to place. A failure part way removes what
 * was kept, so nothing is left behind.
 */
export async function keepCarouselStockPhoto(
  userId: string,
  carouselId: string,
  photo: Pick<
    PexelsPhoto,
    "pexelsId" | "fileUrl" | "pageUrl" | "photographer" | "photographerUrl"
  >,
  download: typeof downloadPexelsPhoto = downloadPexelsPhoto
) {
  await getOwnedCarouselDetail(userId, carouselId)
  let bytes: Uint8Array
  try {
    bytes = await download(photo.fileUrl)
  } catch (error) {
    console.error("Pexels photo download", photo.pexelsId, error)
    throw new Error(STOCK_DOWNLOAD_FAILED_MESSAGE)
  }
  const mimeType = pictureType(bytes)
  if (!mimeType) throw new Error(STOCK_DOWNLOAD_FAILED_MESSAGE)
  const asset = await saveGeneratedAsset({
    userId,
    bytes,
    mimeType,
    fileType: "image",
    name: `Pexels ${photo.pexelsId}`,
    altText: stockCredit(photo),
  })
  try {
    await attachMediaToScope(userId, { type: "carousel", id: carouselId }, asset.id)
  } catch (error) {
    await discardGeneratedAsset(asset)
    throw error
  }
  return { id: asset.id, url: asset.url, name: asset.originalName }
}
