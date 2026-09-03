import sharp from "sharp"

import {
  FAVICON_IMAGE_FIELDS,
  isGeneratedFaviconStoragePath,
  normalizePublicFaviconSet,
  type PublicFaviconSet,
  type PublicFaviconVariant,
} from "@/lib/favicon"
import { uuid } from "@/server/auth/security"
import {
  deleteFromR2,
  getFromR2,
  getPublicMediaUrl,
  uploadToR2,
} from "@/server/media/storage"
import { storagePathForUrl } from "@/server/media/library"

type FaviconSource = {
  storagePath: string
}

type FaviconStorage = {
  createId: () => string
  read: (storagePath: string) => Promise<Uint8Array>
  write: (storagePath: string, data: Uint8Array) => Promise<void>
  remove: (storagePath: string) => Promise<void>
  publicUrl: (storagePath: string) => string
}

const defaultStorage: FaviconStorage = {
  createId: uuid,
  read: async (storagePath) => {
    const object = await getFromR2(storagePath)
    if (!object.Body) throw new Error("The favicon file is empty")
    return new Uint8Array(await object.Body.transformToByteArray())
  },
  write: (storagePath, data) => uploadToR2(storagePath, data, "image/png"),
  remove: deleteFromR2,
  publicUrl: getPublicMediaUrl,
}

/** Makes one immutable PNG set from an image already owned by the admin. */
export async function createFaviconVariant(
  source: FaviconSource,
  mode: "light" | "dark",
  storage: FaviconStorage = defaultStorage
): Promise<PublicFaviconVariant> {
  const sourceData = await storage.read(source.storagePath)
  const ownerPath = source.storagePath.split("/")[0]
  if (!ownerPath) throw new Error("The favicon file has no owner")

  const versionPath = `${ownerPath}/favicons/${storage.createId()}`
  const uploadedPaths: string[] = []
  const images: Partial<PublicFaviconVariant> = {}

  try {
    for (const { key, size } of FAVICON_IMAGE_FIELDS) {
      const storagePath = `${versionPath}/${mode}-${size}.png`
      const data = await resizeFavicon(sourceData, size)
      // Include the path before the request. A storage timeout can happen after
      // R2 accepted the bytes, so cleanup must try the uncertain path too.
      uploadedPaths.push(storagePath)
      await storage.write(storagePath, data)
      images[key] = storage.publicUrl(storagePath)
    }
  } catch (error) {
    await Promise.allSettled(uploadedPaths.map((path) => storage.remove(path)))
    throw error
  }

  return {
    source: storage.publicUrl(source.storagePath),
    icon16: images.icon16!,
    icon32: images.icon32!,
    appleTouchIcon: images.appleTouchIcon!,
    icon512: images.icon512!,
  }
}

/** Removes generated files that the replacement set no longer uses. */
export async function deleteReplacedFaviconFiles(
  previousValue: unknown,
  nextValue: unknown,
  remove: (storagePath: string) => Promise<void> = deleteFromR2
) {
  const previous = normalizePublicFaviconSet(previousValue)
  if (!previous) return

  const nextUrls = new Set(
    faviconFileUrls(normalizePublicFaviconSet(nextValue))
  )
  const oldPaths = faviconFileUrls(previous)
    .filter((url) => !nextUrls.has(url))
    .map(storagePathForUrl)
    .filter((path): path is string =>
      Boolean(path && isGeneratedFaviconStoragePath(path))
    )

  await Promise.all(oldPaths.map((path) => remove(path)))
}

async function resizeFavicon(data: Uint8Array, size: number) {
  return new Uint8Array(
    await sharp(data, {
      failOn: "error",
      limitInputPixels: 25_000_000,
    })
      .rotate()
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()
  )
}

function faviconFileUrls(set: PublicFaviconSet | null) {
  return [set?.light, set?.dark].flatMap((variant) =>
    variant ? FAVICON_IMAGE_FIELDS.map(({ key }) => variant[key]) : []
  )
}
